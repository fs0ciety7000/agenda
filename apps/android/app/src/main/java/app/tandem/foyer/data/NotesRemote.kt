package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.local.CachedDocumentEntity
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.NoteBody
import app.tandem.foyer.data.remote.NoteDto
import app.tandem.foyer.data.remote.NoteRevisionDto
import app.tandem.foyer.data.remote.RestoreNoteBody
import app.tandem.foyer.data.remote.UpdateNoteBody
import app.tandem.foyer.data.remote.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonObject
import java.io.IOException
import java.time.Instant

/**
 * Notes partagées du foyer : lues et modifiées en ligne, comme les dépenses. Une modification
 * faite entre-temps par l'autre renvoie [SaveResult.Conflict] avec sa version.
 */
class NotesRemote(private val api: AgendaApi, private val db: AgendaDatabase) {
    sealed interface SaveResult {
        data class Saved(val note: NoteDto) : SaveResult
        data class Conflict(val current: NoteDto) : SaveResult
        data object Failed : SaveResult
    }

    private val _updates = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val updates: SharedFlow<Unit> = _updates

    /** Une note a changé ailleurs (site, autre téléphone). */
    fun changed() {
        _updates.tryEmit(Unit)
    }

    /** Liste en ligne ; chaque lecture réussie est gardée pour la consultation hors ligne. */
    suspend fun list(): List<NoteDto>? = call { h ->
        api.notes(h).body()?.also { remember(h, it) }
    }

    /** Dernière liste lue (hors ligne, en lecture), ou null si jamais lue sur ce téléphone. */
    suspend fun cached(): List<NoteDto>? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        runCatching { db.cachedDocuments().get(key(h.id)) }.getOrNull()?.let { runCatching { json.decodeFromString<List<NoteDto>>(it) }.getOrNull() }
    }

    /** Copie pour le hors ligne : un échec ne gêne jamais la lecture en ligne. */
    private suspend fun remember(householdId: String, items: List<NoteDto>) {
        runCatching {
            db.cachedDocuments().put(CachedDocumentEntity(key(householdId), json.encodeToString(items), Instant.now().toString()))
        }
    }

    private fun key(householdId: String) = "notes:$householdId"

    suspend fun create(title: String, body: String, pinned: Boolean): Boolean =
        call { h -> api.createNote(h, NoteBody(title.trim(), body.trim(), pinned)).isSuccessful.takeIf { it } } ?: false

    suspend fun update(note: NoteDto, title: String? = null, body: String? = null, pinned: Boolean? = null): SaveResult =
        call { h ->
            val res = api.updateNote(h, note.id, UpdateNoteBody(title?.trim(), body?.trim(), pinned, note.version))
            when {
                res.isSuccessful -> res.body()?.let { SaveResult.Saved(it) }
                res.code() == 409 -> res.errorBody()?.string()?.let(::conflictOf)?.let { SaveResult.Conflict(it) }
                else -> null
            }
        } ?: SaveResult.Failed

    /** Versions précédentes d'une note (la plus récente d'abord) ; null hors ligne. */
    suspend fun revisions(noteId: String): List<NoteRevisionDto>? =
        call { h -> api.noteRevisions(h, noteId).takeIf { it.isSuccessful }?.body() }

    /** Restaure une version : comme une modification (409 si la note a changé entre-temps). */
    suspend fun restore(note: NoteDto, revisionId: String): SaveResult =
        call { h ->
            val res = api.restoreNote(h, note.id, revisionId, RestoreNoteBody(note.version))
            when {
                res.isSuccessful -> res.body()?.let { SaveResult.Saved(it) }
                res.code() == 409 -> res.errorBody()?.string()?.let(::conflictOf)?.let { SaveResult.Conflict(it) }
                else -> null
            }
        } ?: SaveResult.Failed

    suspend fun delete(id: String): Boolean = call { h -> api.deleteNote(h, id).isSuccessful.takeIf { it } } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }

    companion object {
        /** `{"error":{"details":{"current":{…}}}}` → la note telle qu'elle est maintenant. */
        fun conflictOf(body: String): NoteDto? = runCatching {
            val current = json.parseToJsonElement(body).jsonObject["error"]!!.jsonObject["details"]!!
                .jsonObject["current"]!!
            json.decodeFromJsonElement(NoteDto.serializer(), current)
        }.getOrNull()
    }
}
