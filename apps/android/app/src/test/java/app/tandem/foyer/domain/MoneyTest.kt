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

    @Test
    fun `seuil du budget commun comme l'API`() {
        assertEquals(0, Money.budgetLevel(7_999, 10_000))
        assertEquals(80, Money.budgetLevel(8_000, 10_000))
        assertEquals(100, Money.budgetLevel(10_000, 10_000))
        assertEquals(0, Money.budgetLevel(50_000, null))
    }

    @Test
    fun budgets_par_categorie() {
        val (budgets, invalid) = Money.categoryBudgets(mapOf("HOUSING" to "650", "GROCERIES" to " 80,5 ", "LEISURE" to ""))
        // Dans l'ordre des catégories ; champ vide = pas de budget.
        assertEquals(listOf("GROCERIES" to 8050L, "HOUSING" to 65000L), budgets)
        assertEquals(emptySet<String>(), invalid)
        assertEquals(setOf("HOUSING"), Money.categoryBudgets(mapOf("HOUSING" to "abc")).second)
        assertEquals(setOf("HOUSING"), Money.categoryBudgets(mapOf("HOUSING" to "0")).second)
    }
}
