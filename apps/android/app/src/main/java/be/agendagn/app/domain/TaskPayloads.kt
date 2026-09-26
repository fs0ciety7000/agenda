package be.agendagn.app.domain

import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.Repeat
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.domain.model.Visibility
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.DayOfWeek
import java.time.LocalDate

/** Corps JSON des requêtes, conformes à `packages/contracts` (CreateTaskInput, UpdateOccurrenceInput). */
object TaskPayloads {
    private val weekdays = mapOf(
        DayOfWeek.MONDAY to "MO", DayOfWeek.TUESDAY to "TU", DayOfWeek.WEDNESDAY to "WE",
        DayOfWeek.THURSDAY to "TH", DayOfWeek.FRIDAY to "FR", DayOfWeek.SATURDAY to "SA", DayOfWeek.SUNDAY to "SU",
    )

    private fun ids(list: List<String>) = JsonArray(list.map(::JsonPrimitive))

    private fun String?.orNullJson() = this?.let(::JsonPrimitive) ?: JsonNull

    private fun Int?.orNullJson() = this?.let(::JsonPrimitive) ?: JsonNull

    fun create(draft: TaskDraft, myMemberId: String?): JsonObject {
        val personal = draft.personal
        val assignees = if (personal) listOfNotNull(myMemberId) else draft.assigneeIds
        return buildJsonObject {
            put("title", draft.title.trim())
            draft.notes.trim().takeIf { it.isNotEmpty() }?.let { put("notes", it) }
            draft.categoryId?.let { put("categoryId", it) }
            put("priority", draft.priority.name)
            put("visibility", if (personal) Visibility.PERSONAL.name else Visibility.SHARED.name)
            put("assigneeIds", ids(assignees))
            draft.date?.let { put("date", it.toString()) }
            if (draft.date != null) {
                draft.startMinute?.let { put("startMinute", it) }
                if (draft.startMinute != null) draft.durationMinutes?.let { put("durationMinutes", it) }
            }
            put("syncToCalendar", !personal && draft.date != null && draft.syncToCalendar)
            recurrence(draft, assignees)?.let { put("recurrence", it) }
            draft.checklist.map { it.trim() }.filter { it.isNotEmpty() }.takeIf { it.isNotEmpty() }?.let {
                put("checklist", JsonArray(it.map(::JsonPrimitive)))
            }
        }
    }

    /** Règle simple : répétition + rotation (fixe, à deux, chacun son tour). null = tâche ponctuelle. */
    fun recurrence(draft: TaskDraft, assignees: List<String>): JsonObject? {
        val date = draft.date ?: return null
        val rule = when (draft.repeat) {
            Repeat.NONE -> return null
            Repeat.DAILY -> buildJsonObject { put("freq", "DAILY"); put("interval", 1) }
            Repeat.WEEKLY, Repeat.BIWEEKLY -> buildJsonObject {
                put("freq", "WEEKLY")
                put("interval", if (draft.repeat == Repeat.BIWEEKLY) 2 else 1)
                put("byWeekday", JsonArray(listOf(JsonPrimitive(weekdays.getValue(date.dayOfWeek)))))
            }
            Repeat.MONTHLY -> buildJsonObject {
                put("freq", "MONTHLY")
                put("interval", 1)
                // Le 31 (ou le 30 février…) : « dernier jour du mois » plutôt que des mois sautés.
                put("byMonthDay", if (date.dayOfMonth > 28 && date == lastDayOfMonth(date)) -1 else date.dayOfMonth)
            }
        }
        val rotation = when {
            assignees.isEmpty() -> buildJsonObject { put("mode", "UNASSIGNED") }
            assignees.size == 1 -> buildJsonObject { put("mode", "FIXED"); put("memberIds", ids(assignees)) }
            draft.alternate -> buildJsonObject { put("mode", "ALTERNATE"); put("memberIds", ids(assignees)) }
            else -> buildJsonObject { put("mode", "TOGETHER"); put("memberIds", ids(assignees)) }
        }
        return buildJsonObject {
            put("rule", rule)
            put("rotation", rotation)
            put("advance", "PER_OCCURRENCE")
        }
    }

    private fun lastDayOfMonth(d: LocalDate) = d.withDayOfMonth(d.lengthOfMonth())

    fun draftOf(o: Occurrence) = TaskDraft(
        title = o.title,
        notes = o.notes.orEmpty(),
        date = o.date,
        startMinute = o.startMinute,
        durationMinutes = o.durationMinutes,
        assigneeIds = o.assigneeIds,
        categoryId = o.category?.id,
        priority = o.priority,
        personal = o.visibility == Visibility.PERSONAL,
        syncToCalendar = o.syncToCalendar,
    )

    /**
     * Modification : uniquement les champs changés (une série ne reçoit pas de valeurs non modifiées)
     * + `version` (concurrence optimiste). null = rien à envoyer.
     */
    fun update(original: Occurrence, draft: TaskDraft): JsonObject? {
        val before = draftOf(original)
        val changes = buildJsonObject {
            if (draft.title.trim() != before.title) put("title", draft.title.trim())
            if (draft.notes.trim() != before.notes.trim()) put("notes", draft.notes.trim().ifEmpty { null }.orNullJson())
            if (draft.date != before.date) put("date", draft.date?.toString().orNullJson())
            val start = if (draft.date == null) null else draft.startMinute
            if (start != before.startMinute) put("startMinute", start.orNullJson())
            val duration = if (start == null) null else draft.durationMinutes
            if (duration != before.durationMinutes) put("durationMinutes", duration.orNullJson())
            if (draft.assigneeIds.toSet() != before.assigneeIds.toSet() && !draft.personal) {
                put("assigneeIds", ids(draft.assigneeIds))
            }
            if (draft.categoryId != before.categoryId) put("categoryId", draft.categoryId.orNullJson())
            if (draft.priority != before.priority) put("priority", draft.priority.name)
            if (draft.personal != before.personal) {
                put("visibility", if (draft.personal) Visibility.PERSONAL.name else Visibility.SHARED.name)
            }
            val sync = !draft.personal && draft.date != null && draft.syncToCalendar
            if (sync != before.syncToCalendar) put("syncToCalendar", sync)
        }
        if (changes.isEmpty()) return null
        return JsonObject(changes + ("version" to JsonPrimitive(original.version)))
    }
}
