package be.agendagn.app.domain.repository

import be.agendagn.app.domain.model.CalendarStatus
import be.agendagn.app.domain.model.Category
import be.agendagn.app.domain.model.EditScope
import be.agendagn.app.domain.model.Household
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.QuickAddPreview
import be.agendagn.app.domain.model.TaskDraft
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/** Résultat d'une action qui exige le réseau (modifier, supprimer). */
sealed interface OpResult {
    data object Ok : OpResult
    data object Offline : OpResult
    /** La tâche a été modifiée ailleurs entre-temps : la version à jour a été rechargée. */
    data object Conflict : OpResult
    data object NotFound : OpResult
    data class Failed(val code: String?) : OpResult
}

enum class RefreshOutcome { OK, OFFLINE, SIGNED_OUT, NO_HOUSEHOLD, ERROR }

data class SyncState(
    /** Actions faites hors ligne pas encore envoyées. */
    val pending: Int = 0,
    val refreshing: Boolean = false,
    val lastOutcome: RefreshOutcome? = null,
    /** Actions refusées par le serveur lors du dernier envoi (ex. tâche supprimée entre-temps). */
    val rejected: Int = 0,
)

/**
 * Point d'accès unique aux données : lectures depuis le cache Room (hors ligne), écritures
 * optimistes via l'outbox pour cocher / créer, appels directs pour modifier / supprimer.
 */
interface AgendaRepository {
    val household: Flow<Household?>
    val myMemberId: Flow<String?>
    val categories: Flow<List<Category>>
    val occurrences: Flow<List<Occurrence>>
    val syncState: StateFlow<SyncState>
    fun occurrence(id: String): Flow<Occurrence?>

    suspend fun refresh(): RefreshOutcome
    suspend fun toggle(occurrence: Occurrence)
    suspend fun create(draft: TaskDraft)
    suspend fun quickAdd(text: String)
    suspend fun previewQuickAdd(text: String): QuickAddPreview?
    suspend fun update(occurrence: Occurrence, draft: TaskDraft, scope: EditScope): OpResult
    suspend fun delete(occurrence: Occurrence, scope: EditScope): OpResult
    suspend fun calendarStatus(): CalendarStatus?
}
