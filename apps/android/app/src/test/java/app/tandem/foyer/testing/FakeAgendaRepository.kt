package app.tandem.foyer.testing

import app.tandem.foyer.domain.PreviewItem
import app.tandem.foyer.domain.SeriesInfo
import app.tandem.foyer.domain.model.CalendarStatus
import app.tandem.foyer.domain.model.Category
import app.tandem.foyer.domain.model.EditScope
import app.tandem.foyer.domain.model.Household
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.domain.model.OccurrenceStatus
import app.tandem.foyer.domain.model.QuickAddPreview
import app.tandem.foyer.domain.model.SeriesHistory
import app.tandem.foyer.domain.model.ShoppingItem
import app.tandem.foyer.domain.model.TaskTemplate
import app.tandem.foyer.domain.model.TaskDraft
import app.tandem.foyer.domain.repository.AgendaRepository
import app.tandem.foyer.domain.repository.OpResult
import app.tandem.foyer.domain.repository.RefreshOutcome
import app.tandem.foyer.domain.repository.SyncState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonObject

class FakeAgendaRepository(
    occurrences: List<Occurrence> = Fixtures.week(),
    household: Household? = Fixtures.household,
) : AgendaRepository {
    val householdState = MutableStateFlow(household)
    val rows = MutableStateFlow(occurrences)
    override val household: Flow<Household?> = householdState
    override val myMemberId: Flow<String?> = MutableStateFlow(Fixtures.GRACE)
    override val categories: Flow<List<Category>> = MutableStateFlow(listOf(Fixtures.cleaning, Fixtures.groceries))
    override val occurrences: Flow<List<Occurrence>> = rows
    override val syncState = MutableStateFlow(SyncState())
    override fun occurrence(id: String): Flow<Occurrence?> = rows.map { list -> list.firstOrNull { it.id == id } }

    var refreshes = 0
    val created = mutableListOf<TaskDraft>()
    val quickAdds = mutableListOf<String>()
    var updateResult: OpResult = OpResult.Ok
    val updates = mutableListOf<Pair<TaskDraft, EditScope>>()
    val deletes = mutableListOf<EditScope>()
    var preview: QuickAddPreview? = null

    override suspend fun refresh(): RefreshOutcome { refreshes++; return RefreshOutcome.OK }
    override suspend fun toggle(occurrence: Occurrence) {
        rows.value = rows.value.map {
            if (it.id == occurrence.id) it.copy(status = if (it.isDone) OccurrenceStatus.TODO else OccurrenceStatus.DONE, pending = true) else it
        }
    }
    override suspend fun create(draft: TaskDraft) { created += draft }
    override suspend fun quickAdd(text: String) { quickAdds += text }
    override suspend fun previewQuickAdd(text: String) = preview
    val recurrenceUpdates = mutableListOf<JsonObject?>()
    override suspend fun update(occurrence: Occurrence, draft: TaskDraft, scope: EditScope, recurrence: JsonObject?): OpResult {
        updates += draft to scope
        recurrenceUpdates += recurrence
        return updateResult
    }
    var seriesInfo: SeriesInfo? = null
    override suspend fun series(seriesId: String): SeriesInfo? = seriesInfo
    var previewItems: List<PreviewItem>? = null
    val previews = mutableListOf<JsonObject>()
    override suspend fun previewRecurrence(startDate: java.time.LocalDate, recurrence: JsonObject): List<PreviewItem>? {
        previews += recurrence
        return previewItems
    }
    override suspend fun delete(occurrence: Occurrence, scope: EditScope): OpResult { deletes += scope; return OpResult.Ok }
    val restores = mutableListOf<String>()
    override suspend fun restore(occurrenceId: String): OpResult { restores += occurrenceId; return OpResult.Ok }
    val moves = mutableListOf<Pair<String, java.time.LocalDate>>()
    var moveResult: OpResult = OpResult.Ok
    override suspend fun move(occurrenceId: String, date: java.time.LocalDate): OpResult {
        moves += occurrenceId to date
        if (moveResult == OpResult.Ok) rows.value = rows.value.map { if (it.id == occurrenceId) it.copy(date = date) else it }
        return moveResult
    }
    val checklistOps = mutableListOf<String>()
    override suspend fun addChecklistItem(occurrenceId: String, text: String): OpResult {
        checklistOps += "add:$text"; return OpResult.Ok
    }
    override suspend fun setChecklistItemDone(occurrenceId: String, itemId: String, done: Boolean): OpResult {
        checklistOps += "done:$itemId=$done"; return OpResult.Ok
    }
    override suspend fun removeChecklistItem(occurrenceId: String, itemId: String): OpResult {
        checklistOps += "remove:$itemId"; return OpResult.Ok
    }
    override suspend fun calendarStatus(): CalendarStatus? = null

    val shoppingItems = MutableStateFlow<List<ShoppingItem>>(emptyList())
    override val shopping: Flow<List<ShoppingItem>> = shoppingItems
    override suspend fun addShopping(texts: List<String>) {
        shoppingItems.value = shoppingItems.value + texts.map { ShoppingItem("s-$it", it, false) }
    }
    override suspend fun setShoppingDone(item: ShoppingItem, done: Boolean) {
        shoppingItems.value = shoppingItems.value.map { if (it.id == item.id) it.copy(done = done) else it }
    }
    override suspend fun removeShopping(item: ShoppingItem) {
        shoppingItems.value = shoppingItems.value.filter { it.id != item.id }
    }
    override suspend fun clearShoppingDone() {
        shoppingItems.value = shoppingItems.value.filter { !it.done }
    }
    override suspend fun setShoppingAisle(item: ShoppingItem, aisle: String) {
        shoppingItems.value = shoppingItems.value.map { if (it.id == item.id) it.copy(aisle = aisle) else it }
    }
    override suspend fun shoppingSuggestions(): List<String> = emptyList()
    override suspend fun refreshShopping() = RefreshOutcome.OK

    var templateList: List<TaskTemplate>? = null
    val applied = mutableListOf<Pair<String, java.time.LocalDate?>>()
    override suspend fun templates() = templateList
    override suspend fun applyTemplate(template: TaskTemplate, date: java.time.LocalDate?): OpResult {
        applied += template.id to date
        return OpResult.Ok
    }
    var history: SeriesHistory? = null
    override suspend fun seriesHistory(seriesId: String) = history
}
