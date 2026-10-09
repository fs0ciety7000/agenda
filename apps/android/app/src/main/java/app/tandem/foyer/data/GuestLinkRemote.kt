package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.GuestShoppingLinkDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

/**
 * Lien invité vers la liste de courses (lecture seule, sans compte, un par foyer). En ligne
 * seulement : null hors ligne ou en cas d'échec.
 */
class GuestLinkRemote(private val api: AgendaApi, private val db: AgendaDatabase) {
    suspend fun get(): GuestShoppingLinkDto? = call { h -> api.guestShoppingLink(h).takeIf { it.isSuccessful }?.body() }

    /** Crée le lien, ou le remplace (l'ancien cesse de fonctionner). */
    suspend fun create(): GuestShoppingLinkDto? =
        call { h -> api.createGuestShoppingLink(h).takeIf { it.isSuccessful }?.body() }

    suspend fun revoke(): Boolean = call { h -> api.revokeGuestShoppingLink(h).isSuccessful.takeIf { it } } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }
}
