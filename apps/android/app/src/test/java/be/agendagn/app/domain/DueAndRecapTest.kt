package be.agendagn.app.domain

import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.notifications.MorningRecap
import be.agendagn.app.testing.Fixtures.GRACE
import be.agendagn.app.testing.Fixtures.NICOLAS
import be.agendagn.app.testing.Fixtures.TODAY
import be.agendagn.app.testing.Fixtures.household
import be.agendagn.app.testing.Fixtures.occ
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/** Échéance souple, report « ce week-end », récapitulatif du matin (TODAY = mardi 29 sept. 2026). */
class DueAndRecapTest {
    private val sunday = LocalDate.of(2026, 10, 4)

    @Test
    fun `fin de semaine, fin de mois, report du week-end`() {
        assertEquals(sunday, Agenda.endOfWeek(TODAY))
        assertEquals(LocalDate.of(2026, 9, 30), Agenda.endOfMonth(TODAY))
        assertEquals(LocalDate.of(2026, 10, 3), Agenda.postponeWeekend(TODAY)) // mardi → samedi
        assertEquals(sunday, Agenda.postponeWeekend(LocalDate.of(2026, 10, 3))) // samedi → dimanche
        assertEquals(LocalDate.of(2026, 10, 10), Agenda.postponeWeekend(sunday)) // dimanche → samedi suivant
    }

    @Test
    fun `sans date - echeance de la semaine a part, echeance depassee en retard`() {
        val garage = occ("Rappeler le garage", date = null).copy(dueDate = sunday)
        val papers = occ("Trier les papiers", date = null).copy(dueDate = TODAY.minusDays(1))
        val later = occ("Repeindre", date = null).copy(dueDate = TODAY.plusDays(20))
        val s = Agenda.todaySections(listOf(garage, papers, later), TODAY)
        assertEquals(listOf("Rappeler le garage"), s.dueThisWeek.map { it.title })
        assertEquals(listOf("Trier les papiers"), s.overdue.map { it.title })
        assertTrue(Agenda.isOverdue(papers, TODAY))
        assertFalse(Agenda.isOverdue(later, TODAY))
    }

    @Test
    fun `echeance envoyee seulement sans date, retiree quand on planifie`() {
        val body = TaskPayloads.create(TaskDraft(title = "Garage", dueDate = sunday), GRACE, household.members)
        assertEquals("\"2026-10-04\"", body["dueDate"].toString())
        val dated = TaskPayloads.create(TaskDraft(title = "Garage", date = TODAY, dueDate = sunday), GRACE, household.members)
        assertNull(dated["dueDate"])
        val original = occ("Garage", date = null).copy(dueDate = sunday)
        val planned = TaskPayloads.update(original, TaskPayloads.draftOf(original).copy(date = TODAY))!!
        assertEquals("null", planned["dueDate"].toString())
    }

    @Test
    fun `recapitulatif - mes taches du jour, retards et echeances, jamais celles de l autre seul`() {
        val recap = MorningRecap.build(
            listOf(
                occ("Sortir les poubelles", startMinute = 20 * 60, assignees = listOf(GRACE)),
                occ("Salle de bain", assignees = listOf(NICOLAS)),
                occ("Courses", assignees = listOf(GRACE, NICOLAS)),
                occ("Arroser", status = OccurrenceStatus.DONE, assignees = listOf(GRACE)),
                occ("Assurance", date = TODAY.minusDays(2)),
                occ("Garage", date = null).copy(dueDate = sunday),
            ),
            GRACE,
            TODAY,
        )
        assertEquals(listOf("Courses", "Sortir les poubelles"), recap.today.map { it.title }.sorted())
        assertEquals(1, recap.overdue)
        assertEquals(1, recap.dueThisWeek)
        assertTrue(MorningRecap.build(emptyList(), GRACE, TODAY).isEmpty)
    }

    @Test
    fun `prochain recapitulatif - 8 h aujourd hui ou demain`() {
        val zone = ZoneId.of("Europe/Brussels")
        val early = ZonedDateTime.of(TODAY.atTime(6, 30), zone)
        assertEquals(TODAY.atTime(8, 0), MorningRecap.next(early).toLocalDateTime())
        val late = ZonedDateTime.of(TODAY.atTime(9, 0), zone)
        assertEquals(TODAY.plusDays(1).atTime(8, 0), MorningRecap.next(late).toLocalDateTime())
    }
}
