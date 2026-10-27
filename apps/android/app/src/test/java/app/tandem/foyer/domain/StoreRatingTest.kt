package app.tandem.foyer.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StoreRatingTest {
    private fun used(days: List<Long>) = days.fold(StoreRating.State()) { s, d -> StoreRating.recordOpen(s, d) }

    @Test
    fun `un jour ouvert plusieurs fois ne compte qu'une fois`() {
        val s = used(listOf(100, 100, 100, 101))
        assertEquals(StoreRating.State(firstDay = 100, lastActiveDay = 101, activeDays = 2), s)
    }

    @Test
    fun `jamais avant deux semaines, même tous les jours`() {
        val s = used((100L..113L).toList())
        assertFalse(StoreRating.shouldAsk(s, 113))
        assertTrue(StoreRating.shouldAsk(StoreRating.recordOpen(s, 114), 114))
    }

    @Test
    fun `deux semaines sans usage réel ne suffisent pas`() {
        val s = used(listOf(100, 101, 130))
        assertFalse(StoreRating.shouldAsk(s, 130))
        assertTrue(StoreRating.shouldAsk(used(listOf(100, 101, 105, 110, 130)), 130))
    }

    @Test
    fun `une seule demande, puis plus rien pendant quatre mois`() {
        val asked = used(listOf(100, 101, 102, 103, 120)).copy(askedDay = 120)
        assertFalse(StoreRating.shouldAsk(asked, 121))
        assertFalse(StoreRating.shouldAsk(asked, 239))
        assertTrue(StoreRating.shouldAsk(asked, 240))
    }

    @Test
    fun `sans première ouverture connue, pas de demande`() {
        assertFalse(StoreRating.shouldAsk(StoreRating.State(), 1000))
    }
}
