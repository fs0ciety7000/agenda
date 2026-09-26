package be.agendagn.app.domain

import be.agendagn.app.domain.model.Priority
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.testing.Fixtures.GRACE
import be.agendagn.app.testing.Fixtures.NICOLAS
import be.agendagn.app.testing.Fixtures.TODAY
import be.agendagn.app.testing.Fixtures.household
import be.agendagn.app.testing.Fixtures.occ
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

/** Les corps JSON doivent respecter packages/contracts (CreateTaskInput / UpdateOccurrenceInput). */
class TaskPayloadsTest {
    private fun json(s: String) = Json.parseToJsonElement(s) as JsonObject

    @Test
    fun `creation minimale - titre seul, pas de synchro sans date`() {
        assertEquals(
            json("""{"title":"Appeler le plombier","priority":"NORMAL","visibility":"SHARED","assigneeIds":[],"syncToCalendar":false}"""),
            TaskPayloads.create(TaskDraft(title = "  Appeler le plombier ", syncToCalendar = true), GRACE, household.members),
        )
    }

    @Test
    fun `tache recurrente chaque semaine, chacun son tour`() {
        val body = TaskPayloads.create(
            TaskDraft(
                title = "Sortir les poubelles", date = TODAY, startMinute = 1200, durationMinutes = 10,
                assigneeIds = listOf(NICOLAS, GRACE), syncToCalendar = true,
                recurrence = RecurrenceSpec(preset = RepeatPreset.WEEKLY, rotation = RotationKind.ALTERNATE),
            ),
            GRACE,
            household.members,
        )
        assertEquals(
            json(
                """{"title":"Sortir les poubelles","priority":"NORMAL","visibility":"SHARED",
                "assigneeIds":["$NICOLAS","$GRACE"],"date":"2026-09-29","startMinute":1200,"durationMinutes":10,
                "syncToCalendar":true,
                "recurrence":{"rule":{"freq":"WEEKLY","interval":1,"byWeekday":["TU"]},
                "rotation":{"mode":"ALTERNATE","memberIds":["$NICOLAS","$GRACE"]},"advance":"PER_OCCURRENCE"}}""",
            ),
            body,
        )
    }

    @Test
    fun `rotations - personne, une personne, a deux, le 31 devient dernier jour du mois`() {
        val members = household.members
        fun rotation(ids: List<String>, spec: RecurrenceSpec = RecurrenceSpec(preset = RepeatPreset.DAILY)) =
            Recurrences.toJson(spec, TODAY, ids, members, personal = false)!!["rotation"].toString()
        assertEquals("""{"mode":"UNASSIGNED"}""", rotation(emptyList()))
        assertEquals("""{"mode":"FIXED","memberIds":["$GRACE"]}""", rotation(listOf(GRACE)))
        assertEquals("""{"mode":"TOGETHER","memberIds":["$GRACE","$NICOLAS"]}""", rotation(listOf(GRACE, NICOLAS)))
        val monthly = Recurrences.toJson(
            RecurrenceSpec(preset = RepeatPreset.MONTHLY, lastDayOfMonth = true), LocalDate.of(2026, 10, 31), emptyList(), members, false,
        )!!
        assertEquals("""{"freq":"MONTHLY","interval":1,"byMonthDay":-1}""", monthly["rule"].toString())
        val biweekly = Recurrences.toJson(RecurrenceSpec(preset = RepeatPreset.BIWEEKLY), TODAY, emptyList(), members, false)!!
        assertEquals("""{"freq":"WEEKLY","interval":2,"byWeekday":["TU"]}""", biweekly["rule"].toString())
        assertNull(Recurrences.toJson(RecurrenceSpec(preset = RepeatPreset.DAILY), null, emptyList(), members, false))
    }

    @Test
    fun `tache personnelle - attribuee a moi, jamais dans le calendrier partage`() {
        val body = TaskPayloads.create(
            TaskDraft(title = "Dentiste", date = TODAY, personal = true, assigneeIds = listOf(NICOLAS), syncToCalendar = true),
            GRACE,
            household.members,
        )
        assertEquals("PERSONAL", body["visibility"].toString().trim('"'))
        assertEquals("""["$GRACE"]""", body["assigneeIds"].toString())
        assertEquals("false", body["syncToCalendar"].toString())
    }

    @Test
    fun `modification - uniquement les champs changes, effacement explicite, version`() {
        val o = occ("Courses", TODAY, 1080, listOf(GRACE), duration = 60)
        assertNull(TaskPayloads.update(o, TaskPayloads.draftOf(o)))
        val changed = TaskPayloads.update(
            o,
            TaskPayloads.draftOf(o).copy(startMinute = null, priority = Priority.HIGH, assigneeIds = listOf(GRACE, NICOLAS)),
        )!!
        assertEquals(
            json("""{"startMinute":null,"durationMinutes":null,"assigneeIds":["$GRACE","$NICOLAS"],"priority":"HIGH","version":1}"""),
            changed,
        )
    }
}
