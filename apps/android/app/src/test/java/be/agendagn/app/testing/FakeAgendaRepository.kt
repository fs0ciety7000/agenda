package be.agendagn.app.testing

import be.agendagn.app.domain.model.CalendarStatus
import be.agendagn.app.domain.model.Category
import be.agendagn.app.domain.model.EditScope
import be.agendagn.app.domain.model.Household
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.domain.model.QuickAddPreview
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.domain.repository.AgendaRepository
import be.agendagn.app.domain.repository.OpResult
import be.agendagn.app.domain.repository.RefreshOutcome
import be.agendagn.app.domain.repository.SyncState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map

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
    override suspend fun update(occurrence: Occurrence, draft: TaskDraft, scope: EditScope): OpResult {
        updates += draft to scope
        return updateResult
    }
    override suspend fun delete(occurrence: Occurrence, scope: EditScope): OpResult { deletes += scope; return OpResult.Ok }
    val moves = mutableListOf<Pair<String, java.time.LocalDate>>()
    var moveResult: OpResult = OpResult.Ok
    override suspend fun move(occurrenceId: String, date: java.time.LocalDate): OpResult {
        moves += occurrenceId to date
        if (moveResult == OpResult.Ok) rows.value = rows.value.map { if (it.id == occurrenceId) it.copy(date = date) else it }
        return moveResult
    }
    override suspend fun calendarStatus(): CalendarStatus? = null
}
