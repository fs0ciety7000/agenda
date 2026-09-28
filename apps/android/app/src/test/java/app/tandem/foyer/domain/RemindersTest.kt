package app.tandem.foyer.domain

import app.tandem.foyer.data.ReminderSettings
import app.tandem.foyer.domain.model.OccurrenceStatus
import app.tandem.foyer.notifications.Reminders
import app.tandem.foyer.testing.Fixtures.GRACE
import app.tandem.foyer.testing.Fixtures.NICOLAS
import app.tandem.foyer.testing.Fixtures.TODAY
import app.tandem.foyer.testing.Fixtures.occ
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class RemindersTest {
    // Mardi 29 septembre 2026, 08:00 à Bruxelles (UTC+2).
    private val now = Instant.parse("2026-09-29T06:00:00Z")

    @Test
    fun `mes taches avec heure, dans le fuseau du foyer, avant l heure prevue`() {
        val plan = Reminders.plan(
            listOf(
                occ("Salle de bain", TODAY, 10 * 60, listOf(GRACE), id = "mine"),
                occ("Poubelles", TODAY, 20 * 60, listOf(NICOLAS), id = "his"),
                occ("Courses", TODAY, 18 * 60, listOf(GRACE, NICOLAS), id = "together"),
                occ("À définir", TODAY, 12 * 60, id = "unassigned"),
                occ("Sans heure", TODAY, assignees = listOf(GRACE), id = "notime"),
                occ("Déjà faite", TODAY, 11 * 60, listOf(GRACE), status = OccurrenceStatus.DONE, id = "done"),
                occ("Passée", TODAY, 7 * 60, listOf(GRACE), id = "past"),
                occ("Trop loin", TODAY.plusDays(3), 9 * 60, listOf(GRACE), id = "far"),
            ),
            GRACE, "Europe/Brussels", ReminderSettings(enabled = true, leadMinutes = 15), now,
        )
        assertEquals(listOf("mine", "together", "unassigned"), plan.map { it.occurrenceId })
        assertEquals(Instant.parse("2026-09-29T07:45:00Z"), plan.first().at)
    }

    @Test
    fun `desactives - aucun rappel`() {
        val plan = Reminders.plan(
            listOf(occ("Salle de bain", TODAY, 10 * 60, listOf(GRACE))),
            GRACE, "Europe/Brussels", ReminderSettings(enabled = false), now,
        )
        assertEquals(emptyList<Any>(), plan)
    }
}
