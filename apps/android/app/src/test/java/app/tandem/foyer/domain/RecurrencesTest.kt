package app.tandem.foyer.domain

import app.tandem.foyer.testing.Fixtures.GRACE
import app.tandem.foyer.testing.Fixtures.NICOLAS
import app.tandem.foyer.testing.Fixtures.TODAY
import app.tandem.foyer.testing.Fixtures.household
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.DayOfWeek

/** Même modèle que le web (`lib/recurrence.ts`) : règles et rotations conformes au contrat `RecurrenceInput`. */
class RecurrencesTest {
    private val members = household.members // Nicolas, Grace
    private fun json(s: String) = Json.parseToJsonElement(s) as JsonObject

    @Test
    fun `jours ouvres, fin a une date, rotation personnalisee changee chaque semaine`() {
        val spec = RecurrenceSpec(
            preset = RepeatPreset.WEEKDAYS,
            end = RepeatEnd.UNTIL,
            until = TODAY.plusMonths(2),
            rotation = RotationKind.SEQUENCE,
            sequence = listOf(GRACE, RecurrenceSpec.TOGETHER, NICOLAS),
            perWeek = true,
        )
        assertEquals(
            json(
                """{"rule":{"freq":"DAILY","interval":1,"weekdaysOnly":true},"until":"${TODAY.plusMonths(2)}",
                "rotation":{"mode":"SEQUENCE","sequence":[["$GRACE"],["$NICOLAS","$GRACE"],["$NICOLAS"]]},
                "advance":"PER_WEEK"}""",
            ),
            Recurrences.toJson(spec, TODAY, emptyList(), members, personal = false),
        )
    }

    @Test
    fun `selon le jour - lundi Grace, jeudi chacun son tour`() {
        val spec = RecurrenceSpec(
            preset = RepeatPreset.CUSTOM, unit = RepeatUnit.WEEK, interval = 1,
            weekdays = setOf(DayOfWeek.MONDAY, DayOfWeek.THURSDAY),
            rotation = RotationKind.WEEKDAY,
            byDay = mapOf(DayOfWeek.MONDAY to GRACE),
            end = RepeatEnd.COUNT, count = 12,
        )
        assertEquals(
            json(
                """{"rule":{"freq":"WEEKLY","interval":1,"byWeekday":["MO","TH"]},"count":12,
                "rotation":{"mode":"WEEKDAY","days":[
                  {"weekday":0,"sequence":[["$GRACE"]]},
                  {"weekday":3,"sequence":[["$NICOLAS"],["$GRACE"]]}]},
                "advance":"PER_OCCURRENCE"}""",
            ),
            Recurrences.toJson(spec, TODAY, emptyList(), members, personal = false),
        )
    }

    @Test
    fun `chacun son tour commence par la personne choisie, personnel sans rotation`() {
        val spec = RecurrenceSpec(preset = RepeatPreset.WEEKLY, rotation = RotationKind.ALTERNATE, order = listOf(GRACE))
        assertEquals(
            """{"mode":"ALTERNATE","memberIds":["$GRACE","$NICOLAS"]}""",
            Recurrences.toJson(spec, TODAY, emptyList(), members, false)!!["rotation"].toString(),
        )
        assertEquals(
            """{"mode":"UNASSIGNED"}""",
            Recurrences.toJson(spec, TODAY, listOf(GRACE), members, personal = true)!!["rotation"].toString(),
        )
    }

    @Test
    fun `une serie existante pre-remplit le formulaire a l'identique`() {
        val cases = listOf(
            RecurrenceSpec(preset = RepeatPreset.BIWEEKLY, weekdays = setOf(DayOfWeek.TUESDAY), rotation = RotationKind.ALTERNATE, order = listOf(GRACE, NICOLAS)) to emptyList(),
            RecurrenceSpec(preset = RepeatPreset.MONTHLY, lastDayOfMonth = true, end = RepeatEnd.COUNT, count = 6) to listOf(NICOLAS),
            RecurrenceSpec(preset = RepeatPreset.CUSTOM, unit = RepeatUnit.DAY, interval = 3, rotation = RotationKind.SEQUENCE,
                sequence = listOf(NICOLAS, RecurrenceSpec.TOGETHER), perWeek = true) to emptyList(),
            RecurrenceSpec(preset = RepeatPreset.WEEKLY, weekdays = setOf(DayOfWeek.MONDAY, DayOfWeek.FRIDAY), rotation = RotationKind.WEEKDAY,
                byDay = mapOf(DayOfWeek.MONDAY to RecurrenceSpec.TOGETHER, DayOfWeek.FRIDAY to RecurrenceSpec.IN_TURN)) to emptyList(),
        )
        for ((spec, assignees) in cases) {
            val sent = Recurrences.toJson(spec, TODAY, assignees, members, false)!!
            val series = SeriesInfo(
                id = "s", startDate = TODAY, untilDate = null,
                count = sent["count"]?.toString()?.toInt(),
                rule = sent["rule"] as JsonObject, rotation = sent["rotation"] as JsonObject,
                advance = sent["advance"].toString().trim('"'),
            )
            val (back, backAssignees) = Recurrences.fromSeries(series, members)
            assertEquals(sent, Recurrences.toJson(back, TODAY, backAssignees ?: assignees, members, false))
        }
    }
}
