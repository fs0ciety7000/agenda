package app.tandem.foyer.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Locale

class MoneyTest {
    @Test
    fun `montants saisis en centimes`() {
        assertEquals(1250L, Money.parseCents("12,50"))
        assertEquals(1250L, Money.parseCents("12.5"))
        assertEquals(1200L, Money.parseCents("12"))
        assertEquals(123456L, Money.parseCents("1 234,56 €"))
    }

    @Test
    fun `saisies refusées`() {
        listOf("", "0", "-3", "12,345", "abc", "1.2.3", "200000").forEach { assertNull(it, Money.parseCents(it)) }
    }

    @Test
    fun `valeur à modifier dans la langue`() {
        assertEquals("12,50", Money.editable(1250, Locale.FRANCE))
        assertEquals("12.50", Money.editable(1250, Locale.UK))
    }
}
