package app.tandem.foyer.domain

import app.tandem.foyer.domain.model.ShoppingItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ShoppingLiveTest {
    private val now = Instant.parse("2026-10-30T17:00:00Z")
    private fun item(id: String, doneAt: String? = null, by: String? = null) =
        ShoppingItem(id, id, done = doneAt != null, doneById = by, doneAt = doneAt)

    @Test
    fun `liste vide, rien a montrer`() {
        assertNull(ShoppingLive.summarize(emptyList(), now))
    }

    @Test
    fun `article coche il y a 10 min, quelqu'un est au magasin`() {
        val s = ShoppingLive.summarize(
            listOf(item("lait", "2026-10-30T16:50:00Z", "m-tom"), item("pain", "2026-10-30T16:40:00Z", "m-emma"), item("oeufs")),
            now,
        )!!
        assertTrue(s.live)
        assertEquals("m-tom", s.shopperId)
        assertEquals(2, s.done)
        assertEquals(3, s.total)
        assertEquals(1, s.toBuy)
    }

    @Test
    fun `coche il y a plus de 30 min, seulement ce qu'il reste a acheter`() {
        val s = ShoppingLive.summarize(listOf(item("lait", "2026-10-30T16:20:00Z", "m-tom"), item("pain")), now)!!
        assertFalse(s.live)
        assertNull(s.shopperId)
        assertEquals(1, s.toBuy)
    }

    @Test
    fun `tout coche depuis longtemps, la carte disparait`() {
        assertNull(ShoppingLive.summarize(listOf(item("lait", "2026-10-30T12:00:00Z", "m-tom")), now))
    }

    @Test
    fun `tout coche a l'instant, la carte reste`() {
        val s = ShoppingLive.summarize(listOf(item("lait", "2026-10-30T16:59:00Z", "m-tom")), now)!!
        assertTrue(s.live)
        assertEquals(0, s.toBuy)
    }
}
