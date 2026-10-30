package app.tandem.foyer.domain

import app.tandem.foyer.domain.model.ShoppingItem
import java.time.Duration
import java.time.Instant

/** Carte « courses en direct » de l'écran Aujourd'hui (même règle que le web). */
object ShoppingLive {
    /** Un article coché il y a moins de 30 min : quelqu'un est au magasin. */
    val LIVE: Duration = Duration.ofMinutes(30)

    data class Summary(
        val done: Int,
        val total: Int,
        /** Membre qui a coché le dernier article, si c'était il y a moins de [LIVE]. */
        val shopperId: String?,
        val lastDoneAt: Instant?,
    ) {
        val live: Boolean get() = lastDoneAt != null
        val toBuy: Int get() = total - done
    }

    /** null = rien à montrer (liste vide, ou tout est coché et personne n'est au magasin). */
    fun summarize(items: List<ShoppingItem>, now: Instant): Summary? {
        if (items.isEmpty()) return null
        val done = items.filter { it.done }
        val last = done
            .mapNotNull { item -> item.doneAt?.let { runCatching { Instant.parse(it) }.getOrNull() }?.let { item to it } }
            .maxByOrNull { it.second }
            ?.takeIf { Duration.between(it.second, now) < LIVE }
        if (last == null && done.size == items.size) return null
        return Summary(done.size, items.size, last?.first?.doneById, last?.second)
    }
}
