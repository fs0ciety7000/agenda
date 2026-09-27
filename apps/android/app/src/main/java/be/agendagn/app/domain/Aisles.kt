package be.agendagn.app.domain

import be.agendagn.app.R

/** Rayons du magasin, dans l'ordre d'un parcours habituel (cf. @agenda/domain AISLES). */
object Aisles {
    val ORDER = listOf("PRODUCE", "BAKERY", "DAIRY", "MEAT_FISH", "FROZEN", "PANTRY", "DRINKS", "HOUSEHOLD", "HYGIENE", "OTHER")

    fun of(aisle: String?): String = aisle?.takeIf { it in ORDER } ?: "OTHER"

    fun label(aisle: String): Int = when (aisle) {
        "PRODUCE" -> R.string.aisle_produce
        "BAKERY" -> R.string.aisle_bakery
        "DAIRY" -> R.string.aisle_dairy
        "MEAT_FISH" -> R.string.aisle_meat_fish
        "FROZEN" -> R.string.aisle_frozen
        "PANTRY" -> R.string.aisle_pantry
        "DRINKS" -> R.string.aisle_drinks
        "HOUSEHOLD" -> R.string.aisle_household
        "HYGIENE" -> R.string.aisle_hygiene
        else -> R.string.aisle_other
    }
}
