package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.SearchResultsDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

/** Recherche globale du foyer (en ligne). null = hors ligne ou refusé. */
class SearchRemote(private val api: AgendaApi, private val db: AgendaDatabase) {
    suspend fun search(q: String): SearchResultsDto? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            api.search(h.id, q).body()
        } catch (_: IOException) {
            null
        }
    }
}
