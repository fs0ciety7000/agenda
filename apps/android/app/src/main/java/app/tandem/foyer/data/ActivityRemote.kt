package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.ActivityPageDto
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.TrashItemDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

/** Journal d'activité et corbeille : lus en ligne (pas de cache local). null = hors ligne / erreur. */
class ActivityRemote(private val api: AgendaApi, private val db: AgendaDatabase, private val refresh: suspend () -> Unit) {
    suspend fun activity(before: String? = null): ActivityPageDto? = call { h -> api.activity(h, before).body() }

    suspend fun trash(): List<TrashItemDto>? = call { h -> api.trash(h).body() }

    /** Restaure un élément de la corbeille, puis recharge les tâches. */
    suspend fun restore(id: String): Boolean =
        call { h -> api.restoreTrash(h, id).isSuccessful.takeIf { it } }?.also { refresh() } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }
}
