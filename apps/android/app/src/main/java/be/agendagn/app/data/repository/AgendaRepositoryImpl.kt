package be.agendagn.app.data.repository

import be.agendagn.app.data.local.AgendaDatabase
import be.agendagn.app.data.local.OccurrenceEntity
import be.agendagn.app.data.local.PendingOperationEntity
import be.agendagn.app.data.local.ShoppingItemEntity
import be.agendagn.app.data.local.toDomain
import be.agendagn.app.data.local.toEntity
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.data.remote.ApiErrorDto
import be.agendagn.app.data.remote.ChecklistItemDto
import be.agendagn.app.data.remote.ChecklistItemRequest
import be.agendagn.app.data.remote.ChecklistUpdateRequest
import be.agendagn.app.data.remote.QuickAddRequest
import be.agendagn.app.data.remote.json
import be.agendagn.app.data.sync.SyncEngine
import be.agendagn.app.data.sync.SyncScheduler
import be.agendagn.app.domain.PreviewItem
import be.agendagn.app.domain.SeriesInfo
import be.agendagn.app.domain.TaskPayloads
import be.agendagn.app.domain.model.CalendarLinkState
import be.agendagn.app.domain.model.CalendarStatus
import be.agendagn.app.domain.model.Category
import be.agendagn.app.domain.model.EditScope
import be.agendagn.app.domain.model.Household
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.Priority
import be.agendagn.app.domain.model.QuickAddPreview
import be.agendagn.app.domain.model.SeriesHistory
import be.agendagn.app.domain.model.ShoppingItem
import be.agendagn.app.domain.model.TaskTemplate
import be.agendagn.app.data.remote.ApplyTemplateRequest
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.domain.model.Visibility
import be.agendagn.app.domain.repository.AgendaRepository
import be.agendagn.app.domain.repository.OpResult
import be.agendagn.app.domain.repository.RefreshOutcome
import be.agendagn.app.domain.repository.SyncState
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class AgendaRepositoryImpl(
    private val api: AgendaApi,
    private val db: AgendaDatabase,
    private val engine: SyncEngine,
    private val scheduler: SyncScheduler,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val clock: Clock = Clock.systemUTC(),
) : AgendaRepository {
    private val scope = CoroutineScope(SupervisorJob() + io)
    private val householdEntity = db.households().observeCurrent()

    override val household: Flow<Household?> = householdEntity.flatMapLatest { h ->
        if (h == null) flowOf(null)
        else db.households().observeMembers(h.id).map { members ->
            Household(h.id, h.name, h.timezone, members.map { it.toDomain() })
        }
    }

    override val myMemberId: Flow<String?> = householdEntity.map { it?.myMemberId }

    override val categories: Flow<List<Category>> = householdEntity.flatMapLatest { h ->
        if (h == null) flowOf(emptyList()) else db.households().observeCategories(h.id).map { l -> l.map { it.toDomain() } }
    }

    override val occurrences: Flow<List<Occurrence>> = householdEntity.flatMapLatest { h ->
        if (h == null) flowOf(emptyList())
        else combine(db.occurrences().observeAll(h.id), db.pendingOperations().observePendingOccurrenceIds()) { rows, pending ->
            val ids = pending.toSet()
            rows.map { it.toDomain(it.id in ids) }
        }
    }

    private val _syncState = MutableStateFlow(SyncState())
    override val syncState: StateFlow<SyncState> = _syncState.asStateFlow()

    init {
        db.pendingOperations().observeCount().onEach { n -> _syncState.update { it.copy(pending = n) } }.launchIn(scope)
    }

    override fun occurrence(id: String): Flow<Occurrence?> =
        combine(db.occurrences().observe(id), db.pendingOperations().observePendingOccurrenceIds()) { row, pending ->
            row?.toDomain(row.id in pending)
        }

    override suspend fun refresh(): RefreshOutcome = withContext(io) {
        _syncState.update { it.copy(refreshing = true) }
        val outcome = engine.refresh()
        _syncState.update { it.copy(refreshing = false, lastOutcome = outcome) }
        outcome
    }

    override suspend fun toggle(occurrence: Occurrence) = withContext(io) {
        val h = db.households().current() ?: return@withContext
        val done = !occurrence.isDone
        db.occurrences().setStatus(occurrence.id, if (done) "DONE" else "TODO", if (done) Instant.now(clock).toString() else null)
        enqueue(h.id, if (done) PendingOperationEntity.COMPLETE else PendingOperationEntity.REOPEN, occurrence.id, null)
    }

    override suspend fun create(draft: TaskDraft) = withContext(io) {
        val h = db.households().current() ?: return@withContext
        val members = db.households().observeMembers(h.id).first().map { it.toDomain() }
        val payload = TaskPayloads.create(draft, h.myMemberId, members)
        val localId = "local-${UUID.randomUUID()}"
        db.occurrences().upsert(
            localRow(localId, h.id, h.myMemberId, draft.title.trim()).copy(
                notes = draft.notes.trim().ifEmpty { null },
                categoryId = draft.categoryId,
                priority = draft.priority.name,
                visibility = if (draft.personal) Visibility.PERSONAL.name else Visibility.SHARED.name,
                date = draft.date?.toString(),
                dueDate = draft.dueDate?.toString().takeIf { draft.date == null },
                startMinute = draft.startMinute.takeIf { draft.date != null },
                durationMinutes = draft.durationMinutes.takeIf { draft.date != null && draft.startMinute != null },
                assigneeIds = (if (draft.personal) listOfNotNull(h.myMemberId) else draft.assigneeIds).joinToString(","),
                isRecurring = draft.recurrence.repeating && draft.date != null,
                checklist = json.encodeToString(
                    draft.checklist.mapIndexed { i, t -> ChecklistItemDto("$localId-$i", t.trim(), false) },
                ),
            ),
        )
        enqueue(h.id, PendingOperationEntity.CREATE, localId, payload.toString())
    }

    override suspend fun quickAdd(text: String) = withContext(io) {
        val h = db.households().current() ?: return@withContext
        val localId = "local-${UUID.randomUUID()}"
        // Le serveur analysera la phrase (date, heure, responsable) à l'envoi.
        db.occurrences().upsert(localRow(localId, h.id, h.myMemberId, text.trim()))
        enqueue(h.id, PendingOperationEntity.QUICK_ADD, localId, text.trim())
    }

    private fun localRow(id: String, householdId: String, me: String?, title: String) = OccurrenceEntity(
        id = id, householdId = householdId, taskId = id, title = title, notes = null,
        categoryId = null, categoryName = null, categoryEmoji = null, priority = Priority.NORMAL.name,
        visibility = Visibility.SHARED.name, status = "TODO", date = null, startMinute = null,
        durationMinutes = null, assigneeIds = "", createdById = me.orEmpty(), isRecurring = false,
        seriesId = null, syncToCalendar = false, calendarSync = null, completedAt = null, version = 0,
        isLocal = true,
    )

    private suspend fun enqueue(householdId: String, type: String, occurrenceId: String, payload: String?) {
        db.pendingOperations().insert(
            PendingOperationEntity(
                householdId = householdId,
                type = type,
                occurrenceId = occurrenceId,
                payload = payload,
                idempotencyKey = UUID.randomUUID().toString(),
                createdAt = Instant.now(clock).toEpochMilli(),
            ),
        )
        scheduler.requestSync()
    }

    override suspend fun previewQuickAdd(text: String): QuickAddPreview? = withContext(io) {
        val h = db.households().current() ?: return@withContext null
        try {
            api.parseQuickAdd(h.id, QuickAddRequest(text)).body()?.let { p ->
                QuickAddPreview(
                    title = p.title,
                    date = p.date?.let(java.time.LocalDate::parse),
                    startMinute = p.startMinute,
                    assigneeIds = p.assigneeIds.orEmpty(),
                    categoryId = p.categoryId,
                    priority = p.priority?.let { v -> Priority.entries.firstOrNull { it.name == v } },
                )
            }
        } catch (_: IOException) {
            null
        }
    }

    override suspend fun series(seriesId: String): SeriesInfo? = withContext(io) {
        val h = db.households().current() ?: return@withContext null
        try {
            api.series(h.id, seriesId).body()?.let { s ->
                SeriesInfo(
                    id = s.id,
                    startDate = LocalDate.parse(s.startDate),
                    untilDate = s.untilDate?.let(LocalDate::parse),
                    count = s.count,
                    rule = s.rule,
                    rotation = s.rotation,
                    advance = s.advance,
                )
            }
        } catch (_: IOException) {
            null
        }
    }

    override suspend fun previewRecurrence(startDate: LocalDate, recurrence: JsonObject): List<PreviewItem>? =
        withContext(io) {
            val h = db.households().current() ?: return@withContext null
            val body = buildJsonObject {
                put("startDate", startDate.toString())
                put("recurrence", recurrence)
                put("limit", 5)
            }
            try {
                api.previewRecurrence(h.id, body).takeIf { it.isSuccessful }?.body()
                    ?.map { PreviewItem(LocalDate.parse(it.date), it.assigneeIds) }
            } catch (_: IOException) {
                null
            }
        }

    override suspend fun update(
        occurrence: Occurrence,
        draft: TaskDraft,
        scope: EditScope,
        recurrence: JsonObject?,
    ): OpResult = withContext(io) {
        val h = db.households().current() ?: return@withContext OpResult.NotFound
        val body = TaskPayloads.update(occurrence, draft, recurrence) ?: return@withContext OpResult.Ok
        try {
            val res = api.updateOccurrence(h.id, occurrence.id, scope.wire, body)
            when {
                res.isSuccessful -> {
                    res.body()?.let { db.occurrences().upsert(it.toEntity(h.id)) }
                    // Une modification de série touche d'autres occurrences : on recharge tout.
                    if ((occurrence.isRecurring && scope != EditScope.THIS) || recurrence != null) engine.refresh()
                    OpResult.Ok
                }
                res.code() == 409 -> {
                    engine.refresh()
                    OpResult.Conflict
                }
                res.code() == 404 -> {
                    db.occurrences().delete(occurrence.id)
                    OpResult.NotFound
                }
                else -> OpResult.Failed(errorCode(res.errorBody()?.string()))
            }
        } catch (_: IOException) {
            OpResult.Offline
        }
    }

    override suspend fun move(occurrenceId: String, date: LocalDate): OpResult = withContext(io) {
        val h = db.households().current() ?: return@withContext OpResult.NotFound
        // Version relue dans le cache : « Annuler » juste après un déplacement reste valable.
        val current = db.occurrences().get(occurrenceId) ?: return@withContext OpResult.NotFound
        if (current.isLocal) return@withContext OpResult.Offline
        val previous = current.date
        if (previous == date.toString()) return@withContext OpResult.Ok
        db.occurrences().setDate(occurrenceId, date.toString()) // affichage immédiat
        val body = buildJsonObject {
            put("date", date.toString())
            put("version", current.version)
        }
        val revert: suspend () -> Unit = { previous?.let { db.occurrences().setDate(occurrenceId, it) } }
        try {
            val res = api.updateOccurrence(h.id, occurrenceId, EditScope.THIS.wire, body)
            when {
                res.isSuccessful -> {
                    res.body()?.let { db.occurrences().upsert(it.toEntity(h.id)) }
                    OpResult.Ok
                }
                res.code() == 409 -> {
                    engine.refresh()
                    OpResult.Conflict
                }
                res.code() == 404 -> {
                    db.occurrences().delete(occurrenceId)
                    OpResult.NotFound
                }
                else -> {
                    revert()
                    OpResult.Failed(errorCode(res.errorBody()?.string()))
                }
            }
        } catch (_: IOException) {
            revert()
            OpResult.Offline
        }
    }

    override suspend fun addChecklistItem(occurrenceId: String, text: String): OpResult =
        checklistCall(occurrenceId) { h -> api.addChecklistItem(h, occurrenceId, ChecklistItemRequest(text.trim())) }

    override suspend fun setChecklistItemDone(occurrenceId: String, itemId: String, done: Boolean): OpResult =
        withContext(io) {
            val row = db.occurrences().get(occurrenceId) ?: return@withContext OpResult.NotFound
            val items = runCatching { json.decodeFromString<List<ChecklistItemDto>>(row.checklist) }.getOrDefault(emptyList())
            // Affichage immédiat, rétabli si le serveur refuse ou si le réseau manque.
            db.occurrences().upsert(row.copy(checklist = json.encodeToString(items.map { if (it.id == itemId) it.copy(done = done) else it })))
            val result = checklistCall(occurrenceId) { h -> api.updateChecklistItem(h, occurrenceId, itemId, ChecklistUpdateRequest(done)) }
            if (result != OpResult.Ok && result != OpResult.NotFound) {
                db.occurrences().get(occurrenceId)?.let { db.occurrences().upsert(it.copy(checklist = row.checklist)) }
            }
            result
        }

    override suspend fun removeChecklistItem(occurrenceId: String, itemId: String): OpResult =
        checklistCall(occurrenceId) { h -> api.removeChecklistItem(h, occurrenceId, itemId) }

    private suspend fun checklistCall(
        occurrenceId: String,
        call: suspend (householdId: String) -> retrofit2.Response<be.agendagn.app.data.remote.OccurrenceDto>,
    ): OpResult = withContext(io) {
        val h = db.households().current() ?: return@withContext OpResult.NotFound
        try {
            val res = call(h.id)
            when {
                res.isSuccessful -> {
                    res.body()?.let { db.occurrences().upsert(it.toEntity(h.id)) }
                    OpResult.Ok
                }
                res.code() == 404 -> OpResult.NotFound
                else -> OpResult.Failed(errorCode(res.errorBody()?.string()))
            }
        } catch (_: IOException) {
            OpResult.Offline
        }
    }

    override suspend fun delete(occurrence: Occurrence, scope: EditScope): OpResult = withContext(io) {
        val h = db.households().current() ?: return@withContext OpResult.NotFound
        try {
            val res = api.deleteOccurrence(h.id, occurrence.id, scope.wire)
            when {
                res.isSuccessful || res.code() == 404 -> {
                    db.occurrences().delete(occurrence.id)
                    if (occurrence.isRecurring && scope != EditScope.THIS) engine.refresh()
                    OpResult.Ok
                }
                else -> OpResult.Failed(errorCode(res.errorBody()?.string()))
            }
        } catch (_: IOException) {
            OpResult.Offline
        }
    }

    override suspend fun restore(occurrenceId: String): OpResult = withContext(io) {
        val h = db.households().current() ?: return@withContext OpResult.NotFound
        try {
            val res = api.restoreOccurrence(h.id, occurrenceId)
            when {
                res.isSuccessful -> {
                    engine.refresh()
                    OpResult.Ok
                }
                res.code() == 404 -> OpResult.NotFound
                else -> OpResult.Failed(errorCode(res.errorBody()?.string()))
            }
        } catch (_: IOException) {
            OpResult.Offline
        }
    }

    override suspend fun templates(): List<TaskTemplate>? = withContext(io) {
        val h = db.households().current() ?: return@withContext null
        try {
            api.templates(h.id).takeIf { it.isSuccessful }?.body()
                ?.map { t -> TaskTemplate(t.id, t.name, t.emoji, t.items.map { it.title }) }
        } catch (_: IOException) {
            null
        }
    }

    override suspend fun applyTemplate(template: TaskTemplate, date: LocalDate?): OpResult = withContext(io) {
        val h = db.households().current() ?: return@withContext OpResult.NotFound
        try {
            val res = api.applyTemplate(h.id, template.id, ApplyTemplateRequest(date?.toString()))
            when {
                res.isSuccessful -> {
                    res.body()?.forEach { db.occurrences().upsert(it.toEntity(h.id)) }
                    OpResult.Ok
                }
                res.code() == 404 -> OpResult.NotFound
                else -> OpResult.Failed(errorCode(res.errorBody()?.string()))
            }
        } catch (_: IOException) {
            OpResult.Offline
        }
    }

    override suspend fun seriesHistory(seriesId: String): SeriesHistory? = withContext(io) {
        val h = db.households().current() ?: return@withContext null
        try {
            api.seriesHistory(h.id, seriesId).takeIf { it.isSuccessful }?.body()?.let { dto ->
                SeriesHistory(
                    items = dto.items.map {
                        SeriesHistory.Item(
                            date = it.date?.let(LocalDate::parse),
                            done = it.status == "DONE",
                            skipped = it.status == "SKIPPED",
                            completedById = it.completedById,
                        )
                    },
                    doneBy = dto.doneBy.map { it.memberId to it.count },
                )
            }
        } catch (_: IOException) {
            null
        }
    }

    override val shopping: Flow<List<ShoppingItem>> = householdEntity.flatMapLatest { h ->
        if (h == null) flowOf(emptyList()) else db.shopping().observe(h.id).map { l -> l.map { it.toDomain() } }
    }

    override suspend fun addShopping(texts: List<String>) = withContext(io) {
        val h = db.households().current() ?: return@withContext
        for (text in texts.map { it.trim().take(200) }.filter { it.isNotEmpty() }) {
            // Identifiant choisi ici : l'ajout rejoué après une coupure ne crée pas de doublon.
            val id = UUID.randomUUID().toString()
            val now = Instant.now(clock).toString()
            db.shopping().upsert(ShoppingItemEntity(id, h.id, text, false, null, now, null))
            enqueue(h.id, PendingOperationEntity.SHOP_ADD, id, text)
        }
    }

    override suspend fun setShoppingDone(item: ShoppingItem, done: Boolean) = withContext(io) {
        val h = db.households().current() ?: return@withContext
        db.shopping().setDone(item.id, done, if (done) h.myMemberId else null, if (done) Instant.now(clock).toString() else null)
        enqueue(h.id, PendingOperationEntity.SHOP_SET, item.id, done.toString())
    }

    override suspend fun removeShopping(item: ShoppingItem) = withContext(io) {
        val h = db.households().current() ?: return@withContext
        db.shopping().delete(item.id)
        enqueue(h.id, PendingOperationEntity.SHOP_DELETE, item.id, null)
    }

    override suspend fun clearShoppingDone() = withContext(io) {
        val h = db.households().current() ?: return@withContext
        db.shopping().deleteDone(h.id)
        enqueue(h.id, PendingOperationEntity.SHOP_CLEAR, h.id, null)
    }

    override suspend fun setShoppingAisle(item: ShoppingItem, aisle: String) = withContext(io) {
        val h = db.households().current() ?: return@withContext
        db.shopping().setAisle(item.id, aisle)
        enqueue(h.id, PendingOperationEntity.SHOP_AISLE, item.id, aisle)
    }

    override suspend fun shoppingSuggestions(): List<String> = withContext(io) {
        val h = db.households().current() ?: return@withContext emptyList()
        try {
            api.shoppingSuggestions(h.id).body()?.map { it.text }.orEmpty()
        } catch (_: IOException) {
            emptyList()
        }
    }

    override suspend fun refreshShopping(): RefreshOutcome = withContext(io) { engine.refreshShopping() }

    override suspend fun calendarStatus(): CalendarStatus? = withContext(io) {
        val h = db.households().current() ?: return@withContext null
        try {
            val s = api.calendarStatus(h.id).body() ?: return@withContext null
            CalendarStatus(
                state = when {
                    !s.configured -> CalendarLinkState.NOT_CONFIGURED
                    s.link == null -> CalendarLinkState.NOT_LINKED
                    s.link.status == "ACTIVE" -> CalendarLinkState.ACTIVE
                    else -> CalendarLinkState.INVALID
                },
                calendarName = s.link?.summary,
                connectionEmail = s.link?.connectionEmail ?: s.connection?.email,
                errorCode = s.link?.errorCode,
                synced = s.stats.synced,
                pending = s.stats.pending,
                errors = s.stats.errors,
            )
        } catch (_: IOException) {
            null
        }
    }

    /** Déconnexion volontaire : plus rien de ce compte ne reste sur le téléphone. */
    suspend fun clearLocalData() = withContext(io) {
        scheduler.cancelAll()
        db.clearAllTables()
    }

    private fun errorCode(raw: String?): String? =
        raw?.let { runCatching { json.decodeFromString<ApiErrorDto>(it).error.code }.getOrNull() }

}
