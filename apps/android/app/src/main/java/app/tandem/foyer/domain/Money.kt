package app.tandem.foyer.domain

import app.tandem.foyer.R
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/** Montants en centimes entiers (comme l'API), affichés dans la langue de l'app. */
object Money {
    /** Nom affiché d'une catégorie de dépense (ressource traduite). */
    fun categoryRes(category: String?): Int = when (category) {
        "GROCERIES" -> R.string.expense_cat_groceries
        "HOUSING" -> R.string.expense_cat_housing
        "UTILITIES" -> R.string.expense_cat_utilities
        "TRANSPORT" -> R.string.expense_cat_transport
        "LEISURE" -> R.string.expense_cat_leisure
        "HEALTH" -> R.string.expense_cat_health
        "KIDS" -> R.string.expense_cat_kids
        "GIFTS" -> R.string.expense_cat_gifts
        else -> R.string.expense_cat_other
    }

    /** « 12,50 », « 12.5 », « 1 234,56 € » → 1250, 1250, 123456 ; null si illisible ou ≤ 0. */
    fun parseCents(text: String): Long? {
        val cleaned = text.replace(Regex("[€\\s\\u00a0\\u202f]"), "")
        if (!Regex("^\\d+([.,]\\d{1,2})?$").matches(cleaned)) return null
        val parts = cleaned.split('.', ',')
        val euros = parts[0].toLongOrNull() ?: return null
        val cents = parts.getOrNull(1)?.padEnd(2, '0')?.toLong() ?: 0L
        if (euros > 100_000) return null
        val value = euros * 100 + cents
        return value.takeIf { it > 0 }
    }

    /**
     * Champs « budget par catégorie » → budgets à envoyer, dans l'ordre des catégories, et
     * catégories au montant illisible. Un champ vide n'envoie rien (pas de budget).
     */
    fun categoryBudgets(amounts: Map<String, String>): Pair<List<Pair<String, Long>>, Set<String>> {
        val invalid = mutableSetOf<String>()
        val budgets = CATEGORY_EMOJI.keys.mapNotNull { category ->
            val text = amounts[category].orEmpty().trim()
            if (text.isEmpty()) return@mapNotNull null
            val cents = parseCents(text)
            if (cents == null) invalid += category
            cents?.let { category to it }
        }
        return budgets to invalid
    }

    fun format(cents: Long, locale: Locale): String =
        NumberFormat.getCurrencyInstance(locale).apply { currency = Currency.getInstance("EUR") }
            .format(cents / 100.0)

    /** Valeur à modifier dans un champ : « 12,50 » (séparateur de la langue). */
    fun editable(cents: Long, locale: Locale): String =
        NumberFormat.getNumberInstance(locale).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
            isGroupingUsed = false
        }.format(cents / 100.0)

    /** Seuil d'alerte du budget commun atteint : 100, 80 ou 0 (comme l'API). */
    fun budgetLevel(spentCents: Long, budgetCents: Long?): Int = when {
        budgetCents == null || budgetCents <= 0 -> 0
        spentCents >= budgetCents -> 100
        spentCents * 5 >= budgetCents * 4 -> 80
        else -> 0
    }

    /** Emoji des catégories (mêmes que sur le site). */
    val CATEGORY_EMOJI = linkedMapOf(
        "GROCERIES" to "🛒",
        "HOUSING" to "🏠",
        "UTILITIES" to "💡",
        "TRANSPORT" to "🚗",
        "LEISURE" to "🎉",
        "HEALTH" to "💊",
        "KIDS" to "🧸",
        "GIFTS" to "🎁",
        "OTHER" to "📦",
    )
}
