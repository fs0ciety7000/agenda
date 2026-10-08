package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.SwapListDto
import app.tandem.foyer.data.remote.SwapRequestBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

/**
 * Échanges de tour : lus et envoyés en ligne (comme les commentaires). null / false = hors ligne
 * ou refusé ; accepter une tâche faite ou réattribuée entre-temps est refusé par le serveur.
 */
class SwapsRemote(private val api: AgendaApi, private val db: AgendaDatabase) {
    suspend fun list(): SwapListDto? = call { h -> api.swaps(h).body() }

    suspend fun request(occurrenceId: String, toMemberId: String, note: String?): Boolean =
        call { h -> api.requestSwap(h, occurrenceId, SwapRequestBody(toMemberId, note)).isSuccessful.takeIf { it } } ?: false

    suspend fun accept(id: String): Boolean = call { h -> api.acceptSwap(h, id).isSuccessful.takeIf { it } } ?: false

    suspend fun decline(id: String): Boolean = call { h -> api.declineSwap(h, id).isSuccessful.takeIf { it } } ?: false

    suspend fun cancel(id: String): Boolean = call { h -> api.cancelSwap(h, id).isSuccessful.takeIf { it } } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }
}
