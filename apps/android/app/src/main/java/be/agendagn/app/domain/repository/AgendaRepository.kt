package be.agendagn.app.domain.repository

import be.agendagn.app.domain.PreviewItem
import be.agendagn.app.domain.SeriesInfo
import be.agendagn.app.domain.model.CalendarStatus
import be.agendagn.app.domain.model.Category
import be.agendagn.app.domain.model.EditScope
import be.agendagn.app.domain.model.Household
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.QuickAddPreview
import be.agendagn.app.domain.model.SeriesHistory
import be.agendagn.app.domain.model.ShoppingItem
import be.agendagn.app.domain.model.TaskTemplate
import be.agendagn.app.domain.model.TaskDraft
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate

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
    /**
     * [recurrence] : nouvelle répétition (contrat `RecurrenceInput`) à appliquer, null = inchangée.
     */
    suspend fun update(occurrence: Occurrence, draft: TaskDraft, scope: EditScope, recurrence: JsonObject? = null): OpResult

    /** Série d'une tâche récurrente (en ligne uniquement), null si indisponible. */
    suspend fun series(seriesId: String): SeriesInfo?

    /** Prochaines dates et responsables d'une répétition (en ligne uniquement). */
    suspend fun previewRecurrence(startDate: LocalDate, recurrence: JsonObject): List<PreviewItem>?
    suspend fun delete(occurrence: Occurrence, scope: EditScope): OpResult

    /** « Annuler » après une suppression : la tâche revient de la corbeille. */
    suspend fun restore(occurrenceId: String): OpResult
    /** Glisser-déposer du calendrier : change le jour d'UNE occurrence (heure conservée). */
    suspend fun move(occurrenceId: String, date: java.time.LocalDate): OpResult
    /** Sous-tâches : demandent le réseau (comme modifier) ; cocher s'affiche tout de suite. */
    suspend fun addChecklistItem(occurrenceId: String, text: String): OpResult
    suspend fun setChecklistItemDone(occurrenceId: String, itemId: String, done: Boolean): OpResult
    suspend fun removeChecklistItem(occurrenceId: String, itemId: String): OpResult
    suspend fun calendarStatus(): CalendarStatus?

    /** Modèles de tâches du foyer (en ligne), null si indisponibles. */
    suspend fun templates(): List<TaskTemplate>?

    /** Crée les tâches du modèle pour [date] (sans date si null) ; recharge ensuite le cache. */
    suspend fun applyTemplate(template: TaskTemplate, date: LocalDate?): OpResult

    /** Historique d'une tâche récurrente (en ligne), null si indisponible. */
    suspend fun seriesHistory(seriesId: String): SeriesHistory?

    // ───────── Liste de courses (hors ligne : affichée tout de suite, envoyée dès que possible) ─────────

    val shopping: Flow<List<ShoppingItem>>
    suspend fun addShopping(texts: List<String>)
    suspend fun setShoppingDone(item: ShoppingItem, done: Boolean)
    suspend fun removeShopping(item: ShoppingItem)
    suspend fun clearShoppingDone()
    /** Rayon choisi pour un article (retenu par le serveur pour ce produit). */
    suspend fun setShoppingAisle(item: ShoppingItem, aisle: String)
    /** Souvent achetés, absents de la liste (en ligne ; vide sinon). */
    suspend fun shoppingSuggestions(): List<String>
    suspend fun refreshShopping(): RefreshOutcome
}
