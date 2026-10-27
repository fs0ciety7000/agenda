package app.tandem.foyer.domain

/**
 * Demande d'avis Google Play : après environ deux semaines d'utilisation réelle, une fois, puis
 * au plus tous les quatre mois (Google décide de toute façon s'il affiche la fenêtre). Jours
 * comptés en jours depuis l'époque, dans le fuseau du téléphone.
 */
object StoreRating {
    /** Jours depuis la première ouverture. */
    const val MIN_DAYS_SINCE_FIRST = 14
    /** Jours différents où l'app a été ouverte. */
    const val MIN_ACTIVE_DAYS = 5
    /** Écart minimal entre deux demandes. */
    const val RETRY_DAYS = 120

    data class State(
        val firstDay: Long? = null,
        val lastActiveDay: Long? = null,
        val activeDays: Int = 0,
        val askedDay: Long? = null,
    )

    /** Ouverture de l'app ce jour-là : un jour actif de plus s'il n'est pas déjà compté. */
    fun recordOpen(state: State, today: Long): State = when (state.lastActiveDay) {
        today -> state
        else -> state.copy(firstDay = state.firstDay ?: today, lastActiveDay = today, activeDays = state.activeDays + 1)
    }

    fun shouldAsk(state: State, today: Long): Boolean {
        val first = state.firstDay ?: return false
        if (today - first < MIN_DAYS_SINCE_FIRST || state.activeDays < MIN_ACTIVE_DAYS) return false
        return state.askedDay == null || today - state.askedDay >= RETRY_DAYS
    }
}
