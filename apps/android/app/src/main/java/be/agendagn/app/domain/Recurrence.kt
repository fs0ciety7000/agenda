package be.agendagn.app.domain

import be.agendagn.app.domain.model.Member
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.DayOfWeek
import java.time.LocalDate

/** AFTER : « X jours / semaines / mois après la dernière fois » (compté à partir du jour où c'est fait). */
enum class RepeatPreset { NONE, DAILY, WEEKDAYS, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, YEARLY, AFTER, CUSTOM }

enum class RepeatUnit { DAY, WEEK, MONTH, YEAR }

enum class RepeatEnd { NEVER, UNTIL, COUNT }

/** FIXED : les responsables choisis (« Qui ? ») ; les autres modes font tourner la tâche. */
enum class RotationKind { FIXED, ALTERNATE, SEQUENCE, WEEKDAY }

/**
 * Répétition + rotation saisies dans le formulaire (même modèle que le web, `lib/recurrence.ts`).
 * Étapes de rotation : id de membre, [TOGETHER] (à deux), [NOBODY] (à définir) ou, pour la rotation
 * « selon le jour », [IN_TURN] (chacun son tour ce jour-là).
 */
data class RecurrenceSpec(
    val preset: RepeatPreset = RepeatPreset.NONE,
    val interval: Int = 1,
    val unit: RepeatUnit = RepeatUnit.WEEK,
    /** Vide : le jour de la date de début. */
    val weekdays: Set<DayOfWeek> = emptySet(),
    val lastDayOfMonth: Boolean = false,
    val end: RepeatEnd = RepeatEnd.NEVER,
    val until: LocalDate? = null,
    val count: Int = 10,
    val rotation: RotationKind = RotationKind.FIXED,
    /** Chacun son tour : ordre des membres (vide = ordre du foyer). */
    val order: List<String> = emptyList(),
    /** Rotation personnalisée (vide = un tour par membre). */
    val sequence: List<String> = emptyList(),
    val byDay: Map<DayOfWeek, String> = emptyMap(),
    /** Changer de responsable chaque semaine plutôt qu'à chaque fois. */
    val perWeek: Boolean = false,
) {
    val repeating: Boolean get() = preset != RepeatPreset.NONE

    val after: Boolean get() = preset == RepeatPreset.AFTER

    val showsWeekdays: Boolean
        get() = preset == RepeatPreset.WEEKLY || preset == RepeatPreset.BIWEEKLY ||
            (preset == RepeatPreset.CUSTOM && unit == RepeatUnit.WEEK)

    val showsMonthDay: Boolean
        get() = preset == RepeatPreset.MONTHLY || preset == RepeatPreset.QUARTERLY ||
            (preset == RepeatPreset.CUSTOM && unit == RepeatUnit.MONTH)

    companion object {
        const val TOGETHER = "together"
        const val NOBODY = "none"
        const val IN_TURN = "alternate"
    }
}

object Recurrences {
    private val codes = mapOf(
        DayOfWeek.MONDAY to "MO", DayOfWeek.TUESDAY to "TU", DayOfWeek.WEDNESDAY to "WE",
        DayOfWeek.THURSDAY to "TH", DayOfWeek.FRIDAY to "FR", DayOfWeek.SATURDAY to "SA", DayOfWeek.SUNDAY to "SU",
    )
    private val days = codes.entries.associate { (k, v) -> v to k }

    fun weekdays(s: RecurrenceSpec, date: LocalDate): List<DayOfWeek> =
        (s.weekdays.ifEmpty { setOf(date.dayOfWeek) }).sorted()

    /** Règle RRULE simplifiée (contrat `RecurrenceRule`), null = pas de répétition. */
    fun rule(s: RecurrenceSpec, date: LocalDate): JsonObject? {
        val byMonthDay = if (s.lastDayOfMonth) -1 else date.dayOfMonth
        val weekly = { interval: Int ->
            buildJsonObject {
                put("freq", "WEEKLY")
                put("interval", interval)
                put("byWeekday", JsonArray(weekdays(s, date).map { JsonPrimitive(codes.getValue(it)) }))
            }
        }
        val daily = { interval: Int, weekdaysOnly: Boolean ->
            buildJsonObject { put("freq", "DAILY"); put("interval", interval); put("weekdaysOnly", weekdaysOnly) }
        }
        val monthly = { interval: Int ->
            buildJsonObject { put("freq", "MONTHLY"); put("interval", interval); put("byMonthDay", byMonthDay) }
        }
        val yearly = { interval: Int -> buildJsonObject { put("freq", "YEARLY"); put("interval", interval) } }
        return when (s.preset) {
            RepeatPreset.NONE -> null
            RepeatPreset.DAILY -> daily(1, false)
            RepeatPreset.WEEKDAYS -> daily(1, true)
            RepeatPreset.WEEKLY -> weekly(1)
            RepeatPreset.BIWEEKLY -> weekly(2)
            RepeatPreset.MONTHLY -> monthly(1)
            RepeatPreset.QUARTERLY -> monthly(3)
            RepeatPreset.YEARLY -> yearly(1)
            RepeatPreset.AFTER -> buildJsonObject {
                put("freq", "AFTER")
                put("interval", s.interval.coerceIn(1, 365))
                put("unit", if (s.unit == RepeatUnit.YEAR) "MONTH" else s.unit.name)
            }
            RepeatPreset.CUSTOM -> {
                val n = s.interval.coerceIn(1, 365)
                when (s.unit) {
                    RepeatUnit.DAY -> daily(n, false)
                    RepeatUnit.WEEK -> weekly(n.coerceAtMost(52))
                    RepeatUnit.MONTH -> monthly(n.coerceAtMost(24))
                    RepeatUnit.YEAR -> yearly(n.coerceAtMost(10))
                }
            }
        }
    }

    /** Jours de semaine produits par la règle (pour la rotation « selon le jour »). */
    fun ruleWeekdays(s: RecurrenceSpec, date: LocalDate): List<DayOfWeek> {
        val rule = rule(s, date) ?: return emptyList()
        return when (rule["freq"]?.jsonPrimitive?.content) {
            "WEEKLY" -> weekdays(s, date)
            "DAILY" -> if (rule["weekdaysOnly"]?.jsonPrimitive?.boolean == true) DayOfWeek.entries.take(5) else DayOfWeek.entries
            else -> emptyList()
        }
    }

    fun order(s: RecurrenceSpec, members: List<Member>): List<String> {
        val ids = members.map { it.id }
        return s.order.filter { it in ids }.let { chosen -> chosen + ids.filter { it !in chosen } }
    }

    fun sequence(s: RecurrenceSpec, members: List<Member>): List<String> =
        s.sequence.ifEmpty { members.map { it.id }.ifEmpty { listOf(RecurrenceSpec.NOBODY) } }

    private fun stepMembers(v: String, members: List<Member>): List<String> = when (v) {
        RecurrenceSpec.TOGETHER -> members.map { it.id }
        RecurrenceSpec.NOBODY -> emptyList()
        else -> listOf(v)
    }

    private fun ids(list: List<String>) = JsonArray(list.map(::JsonPrimitive))

    private fun steps(list: List<List<String>>) = buildJsonArray { list.forEach { add(ids(it)) } }

    private val unassigned = buildJsonObject { put("mode", "UNASSIGNED") }

    fun rotation(s: RecurrenceSpec, assignees: List<String>, members: List<Member>, date: LocalDate): JsonObject =
        when (s.rotation) {
            RotationKind.FIXED -> when {
                assignees.isEmpty() -> unassigned
                assignees.size == 1 -> buildJsonObject { put("mode", "FIXED"); put("memberIds", ids(assignees)) }
                else -> buildJsonObject { put("mode", "TOGETHER"); put("memberIds", ids(assignees)) }
            }
            RotationKind.ALTERNATE -> order(s, members).let { order ->
                if (order.size < 2) unassigned
                else buildJsonObject { put("mode", "ALTERNATE"); put("memberIds", ids(order)) }
            }
            RotationKind.SEQUENCE -> {
                val list = sequence(s, members).map { stepMembers(it, members) }.filter { it.isNotEmpty() }
                if (list.isEmpty()) unassigned else buildJsonObject { put("mode", "SEQUENCE"); put("sequence", steps(list)) }
            }
            RotationKind.WEEKDAY -> {
                val perDay = ruleWeekdays(s, date).mapNotNull { day ->
                    val v = s.byDay[day] ?: RecurrenceSpec.IN_TURN
                    val seq = (if (v == RecurrenceSpec.IN_TURN) members.map { listOf(it.id) } else listOf(stepMembers(v, members)))
                        .filter { it.isNotEmpty() }
                    if (seq.isEmpty()) null
                    else buildJsonObject { put("weekday", day.value - 1); put("sequence", steps(seq)) }
                }
                if (perDay.isEmpty()) unassigned else buildJsonObject { put("mode", "WEEKDAY"); put("days", JsonArray(perDay)) }
            }
        }

    /** Contrat `RecurrenceInput` ; null = tâche ponctuelle (ou pas de date). */
    fun toJson(
        s: RecurrenceSpec,
        date: LocalDate?,
        assignees: List<String>,
        members: List<Member>,
        personal: Boolean,
    ): JsonObject? {
        if (date == null) return null
        val rule = rule(s, date) ?: return null
        return buildJsonObject {
            put("rule", rule)
            if (s.end == RepeatEnd.UNTIL && s.until != null) put("until", s.until.toString())
            if (s.end == RepeatEnd.COUNT && !s.after) put("count", s.count.coerceIn(1, 1000))
            put("rotation", if (personal) unassigned else rotation(s, assignees, members, date))
            put("advance", if (s.perWeek && !s.after) "PER_WEEK" else "PER_OCCURRENCE")
        }
    }

    /** Pré-remplit le formulaire depuis une série existante ; renvoie aussi les responsables (mode fixe). */
    fun fromSeries(series: SeriesInfo, members: List<Member>): Pair<RecurrenceSpec, List<String>?> {
        val r = series.rule
        val freq = r["freq"]?.jsonPrimitive?.content
        val interval = r["interval"]?.jsonPrimitive?.int ?: 1
        var spec = RecurrenceSpec(interval = interval)
        spec = when (freq) {
            "AFTER" -> spec.copy(
                preset = RepeatPreset.AFTER,
                unit = when (r["unit"]?.jsonPrimitive?.content) { "DAY" -> RepeatUnit.DAY; "WEEK" -> RepeatUnit.WEEK; else -> RepeatUnit.MONTH },
            )
            "DAILY" -> spec.copy(
                unit = RepeatUnit.DAY,
                preset = when {
                    r["weekdaysOnly"]?.jsonPrimitive?.boolean == true -> RepeatPreset.WEEKDAYS
                    interval == 1 -> RepeatPreset.DAILY
                    else -> RepeatPreset.CUSTOM
                },
            )
            "WEEKLY" -> spec.copy(
                unit = RepeatUnit.WEEK,
                weekdays = r["byWeekday"]?.jsonArray?.mapNotNull { days[it.jsonPrimitive.content] }?.toSet().orEmpty(),
                preset = when (interval) { 1 -> RepeatPreset.WEEKLY; 2 -> RepeatPreset.BIWEEKLY; else -> RepeatPreset.CUSTOM },
            )
            "MONTHLY" -> spec.copy(
                unit = RepeatUnit.MONTH,
                lastDayOfMonth = r["byMonthDay"]?.jsonPrimitive?.int == -1,
                preset = when (interval) { 1 -> RepeatPreset.MONTHLY; 3 -> RepeatPreset.QUARTERLY; else -> RepeatPreset.CUSTOM },
            )
            else -> spec.copy(unit = RepeatUnit.YEAR, preset = if (interval == 1) RepeatPreset.YEARLY else RepeatPreset.CUSTOM)
        }
        spec = spec.copy(
            end = when {
                series.untilDate != null -> RepeatEnd.UNTIL
                series.count != null -> RepeatEnd.COUNT
                else -> RepeatEnd.NEVER
            },
            until = series.untilDate,
            count = series.count ?: 10,
            perWeek = series.advance == "PER_WEEK",
        )

        val all = members.map { it.id }.sorted()
        fun stepValue(list: List<String>) = when {
            list.isEmpty() -> RecurrenceSpec.NOBODY
            list.size > 1 && list.sorted() == all -> RecurrenceSpec.TOGETHER
            else -> list.first()
        }
        fun idList(el: kotlinx.serialization.json.JsonElement) = el.jsonArray.map { it.jsonPrimitive.content }
        val rot = series.rotation
        val memberIds = rot["memberIds"]?.let(::idList).orEmpty()
        return when (rot["mode"]?.jsonPrimitive?.content) {
            "FIXED", "TOGETHER" -> spec to memberIds
            "ALTERNATE" -> spec.copy(rotation = RotationKind.ALTERNATE, order = memberIds) to null
            "SEQUENCE" -> spec.copy(
                rotation = RotationKind.SEQUENCE,
                sequence = rot["sequence"]?.jsonArray?.map { stepValue(idList(it)) }.orEmpty(),
            ) to null
            "WEEKDAY" -> spec.copy(
                rotation = RotationKind.WEEKDAY,
                byDay = rot["days"]?.jsonArray?.associate { el ->
                    val o = el.jsonObject
                    val seq = o["sequence"]?.jsonArray.orEmpty()
                    DayOfWeek.of(o.getValue("weekday").jsonPrimitive.int + 1) to
                        (if (seq.size > 1) RecurrenceSpec.IN_TURN else stepValue(seq.firstOrNull()?.let(::idList).orEmpty()))
                }.orEmpty(),
            ) to null
            else -> spec to emptyList()
        }
    }
}

/** Série telle que renvoyée par l'API (`SeriesDto`), règle et rotation au format du contrat. */
data class SeriesInfo(
    val id: String,
    val startDate: LocalDate,
    val untilDate: LocalDate?,
    val count: Int?,
    val rule: JsonObject,
    val rotation: JsonObject,
    val advance: String,
)

/** Aperçu des prochaines dates calculé par l'API (même moteur que la génération réelle). */
data class PreviewItem(val date: LocalDate, val assigneeIds: List<String>)
