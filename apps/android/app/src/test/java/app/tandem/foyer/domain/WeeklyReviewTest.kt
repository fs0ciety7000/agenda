package app.tandem.foyer.domain

import app.tandem.foyer.domain.model.OccurrenceStatus
import app.tandem.foyer.notifications.WeeklyReview
import app.tandem.foyer.testing.Fixtures.GRACE
import app.tandem.foyer.testing.Fixtures.NICOLAS
import app.tandem.foyer.testing.Fixtures.TODAY
import app.tandem.foyer.testing.Fixtures.household
import app.tandem.foyer.testing.Fixtures.occ
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** Revue du dimanche (TODAY = mardi 29 sept. 2026, semaine du lundi 28). */
class WeeklyReviewTest {
    private val zone = ZoneId.of("Europe/Brussels")

    @Test
    fun `faites cette semaine par personne, merci, glissees et semaine suivante`() {
        val monday = TODAY.minusDays(1)
        val doneAt = monday.atTime(10, 0).atZone(zone).toInstant()
        val trash = occ("Poubelles", date = monday).copy(
            status = OccurrenceStatus.DONE, completedAt = doneAt, completedById = GRACE, thankedBy = listOf(NICOLAS),
        )
        val plants = occ("Plantes", date = monday).copy(status = OccurrenceStatus.DONE, completedAt = doneAt, completedById = GRACE)
        val lastWeek = occ("Vieux", date = monday.minusDays(3)).copy(
            status = OccurrenceStatus.DONE, completedAt = doneAt.minusSeconds(3 * 86_400), completedById = NICOLAS,
        )
        val missed = occ("Garage", date = monday)
        val next = occ("Courses", date = monday.plusDays(8))
        val review = WeeklyReview.build(listOf(trash, plants, lastWeek, missed, next), household.members, TODAY, zone)
        assertEquals(2, review.done)
        assertEquals(1, review.thanks)
        assertEquals(1, review.missed)
        assertEquals(1, review.nextWeek)
        assertEquals(listOf("Grace" to 2), review.doneBy)
    }

    @Test
    fun `prochaine revue le dimanche a 19 h`() {
        val now = TODAY.atTime(12, 0).atZone(zone)
        assertEquals(ZonedDateTime.of(2026, 10, 4, 19, 0, 0, 0, zone), WeeklyReview.next(now))
        val sundayLate = ZonedDateTime.of(2026, 10, 4, 20, 0, 0, 0, zone)
        assertEquals(ZonedDateTime.of(2026, 10, 11, 19, 0, 0, 0, zone), WeeklyReview.next(sundayLate))
    }
}
