package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AbsenceDto
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.CreateAbsenceBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.time.LocalDate

/**
 * Mode absence : lu et modifié en ligne. Après un changement, les tâches sont rechargées
 * (leurs responsables ont changé). null / false = hors ligne ou refusé.
 */
class AbsencesRemote(
    private val api: AgendaApi,
    private val db: AgendaDatabase,
    private val refresh: suspend () -> Unit,
) {
    suspend fun list(): List<AbsenceDto>? = call { h -> api.absences(h).body() }

    suspend fun create(memberId: String, start: LocalDate, end: LocalDate): Boolean =
        call { h ->
            api.createAbsence(h, CreateAbsenceBody(memberId, start.toString(), end.toString())).isSuccessful.takeIf { it }
        }?.also { refresh() } ?: false

    suspend fun delete(id: String): Boolean =
        call { h -> api.deleteAbsence(h, id).isSuccessful.takeIf { it } }?.also { refresh() } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }
}
