package be.agendagn.app.data

import be.agendagn.app.data.local.AgendaDatabase
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.data.remote.CommentDto
import be.agendagn.app.data.remote.CreateCommentBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.withContext
import java.io.IOException

/** Commentaires des tâches : lus et écrits en ligne ; [updates] signale un changement (temps réel). */
class CommentsRemote(private val api: AgendaApi, private val db: AgendaDatabase) {
    private val _updates = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val updates: SharedFlow<Unit> = _updates

    /** Un commentaire a été ajouté ou supprimé ailleurs (site, autre téléphone). */
    fun changed() {
        _updates.tryEmit(Unit)
    }

    suspend fun list(occurrenceId: String): List<CommentDto>? = call { h -> api.comments(h, occurrenceId).body() }

    suspend fun add(occurrenceId: String, body: String): Boolean =
        call { h -> api.addComment(h, occurrenceId, CreateCommentBody(body)).isSuccessful.takeIf { it } } ?: false

    suspend fun delete(id: String): Boolean =
        call { h -> api.deleteComment(h, id).isSuccessful.takeIf { it } } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }
}
