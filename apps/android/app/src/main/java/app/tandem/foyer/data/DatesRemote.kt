package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.local.CachedDocumentEntity
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.ImportantDateBody
import app.tandem.foyer.data.remote.ImportantDateDto
import app.tandem.foyer.data.remote.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit

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

    /** Liste en ligne ; chaque lecture réussie est gardée pour la consultation hors ligne. */
    suspend fun list(): List<ImportantDateDto>? = call { h ->
        api.importantDates(h).body()?.also {
            remember(h, it)
        }
    }

    /** Dernière liste lue, remise à la date du jour (« dans N jours »), ou null si jamais lue. */
    suspend fun cached(today: LocalDate = LocalDate.now()): List<ImportantDateDto>? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        runCatching { db.cachedDocuments().get(key(h.id)) }.getOrNull()
            ?.let { runCatching { json.decodeFromString<List<ImportantDateDto>>(it) }.getOrNull() }
            ?.let { refreshed(it, today) }
    }

    /** Copie pour le hors ligne : un échec ne gêne jamais la lecture en ligne. */
    private suspend fun remember(householdId: String, items: List<ImportantDateDto>) {
        runCatching {
            db.cachedDocuments().put(CachedDocumentEntity(key(householdId), json.encodeToString(items), Instant.now().toString()))
        }
    }

    private fun key(householdId: String) = "dates:$householdId"

    companion object {
        /**
         * Recalcule « dans N jours » d'une copie hors ligne : une date annuelle déjà passée repart
         * l'année suivante (âge + 1) ; une date unique passée n'a plus de prochaine fois.
         */
        fun refreshed(items: List<ImportantDateDto>, today: LocalDate): List<ImportantDateDto> = items.map { d ->
            var next = d.nextDate?.let(LocalDate::parse) ?: return@map d
            var years = d.years
            while (next < today && d.repeatsYearly) {
                next = next.plusYears(1)
                years = years?.plus(1)
            }
            if (next < today) {
                d.copy(nextDate = null, daysLeft = null)
            } else {
                d.copy(nextDate = next.toString(), daysLeft = ChronoUnit.DAYS.between(today, next).toInt(), years = years)
            }
        }.sortedWith(compareBy(nullsLast()) { it.daysLeft })
    }

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
