package app.tandem.foyer.data

import app.tandem.foyer.data.remote.QuickAddRequest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class QuickAddPayloadTest {
    @Test
    fun `sans jour, le texte seul comme avant`() {
        val payload = QuickAddRequest.encode("Arroser les plantes", null)
        assertEquals("Arroser les plantes", payload)
        assertEquals(QuickAddRequest("Arroser les plantes"), QuickAddRequest.decode(payload))
    }

    @Test
    fun `avec un jour, le jour voyage avec la phrase`() {
        val payload = QuickAddRequest.encode("Appeler le garage", LocalDate.of(2026, 11, 2))
        assertEquals(QuickAddRequest("Appeler le garage", "2026-11-02"), QuickAddRequest.decode(payload))
    }

    @Test
    fun `une operation deja en file (texte brut) reste lisible`() {
        assertEquals(QuickAddRequest("{pas du JSON"), QuickAddRequest.decode("{pas du JSON"))
    }
}
