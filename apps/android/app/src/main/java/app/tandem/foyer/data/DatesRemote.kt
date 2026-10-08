package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.ImportantDateBody
import app.tandem.foyer.data.remote.ImportantDateDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.withContext
import java.io.IOException

/**
 * Dates importantes : lues et modifiées en ligne (la prochaine occurrence et l'âge sont calculés
 * par l'API). null / false = hors ligne ou refusé.
 */
class DatesRemote(private val api: AgendaApi, private val db: AgendaDatabase) {
    private val _updates = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val updates: SharedFlow<Unit> = _updates

    /** Une date a changé ailleurs (site, autre téléphone). */
    fun changed() {
        _updates.tryEmit(Unit)
    }

    suspend fun list(): List<ImportantDateDto>? = call { h -> api.importantDates(h).body() }

    /** Ajoute (id null) ou modifie une date. */
    suspend fun save(id: String?, body: ImportantDateBody): Boolean = call { h ->
        (if (id == null) api.createImportantDate(h, body) else api.updateImportantDate(h, id, body)).isSuccessful.takeIf { it }
    } ?: false

    suspend fun delete(id: String): Boolean = call { h -> api.deleteImportantDate(h, id).isSuccessful.takeIf { it } } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }
}
