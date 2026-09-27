package be.agendagn.app.ui.taskform

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.agendagn.app.domain.PreviewItem
import be.agendagn.app.domain.Recurrences
import be.agendagn.app.domain.SeriesInfo
import be.agendagn.app.domain.TaskPayloads
import be.agendagn.app.domain.model.ChecklistItem
import be.agendagn.app.domain.model.EditScope
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.SeriesHistory
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.domain.repository.AgendaRepository
import be.agendagn.app.domain.repository.OpResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate

enum class FormError { TITLE_REQUIRED, OFFLINE, CONFLICT, NOT_FOUND, GENERIC }

data class TaskFormState(
    val loading: Boolean = true,
    /** null = création. */
    val original: Occurrence? = null,
    val draft: TaskDraft = TaskDraft(),
    val saving: Boolean = false,
    val error: FormError? = null,
    /** Série : demander la portée avant d'enregistrer / supprimer. */
    val askScopeFor: ScopeAction? = null,
    val confirmDelete: Boolean = false,
    val done: Boolean = false,
    /** Modification : sous-tâches à jour (cache local, suit les changements de l'autre téléphone). */
    val checklist: List<ChecklistItem> = emptyList(),
    val checklistError: FormError? = null,
    val members: List<Member> = emptyList(),
    val myMemberId: String? = null,
    /** Tâche récurrente : série chargée depuis le serveur (null tant qu'elle ne l'est pas). */
    val series: SeriesInfo? = null,
    /** Série introuvable hors ligne : la répétition ne peut pas être modifiée pour l'instant. */
    val seriesUnavailable: Boolean = false,
    /** Répétition telle que chargée (pour savoir si l'utilisateur l'a modifiée). */
    val initialRecurrence: String? = null,
    /** Prochaines dates et responsables (null = indisponible). */
    val preview: List<PreviewItem>? = null,
    /** Portées proposées : une nouvelle répétition ne peut pas concerner une seule occurrence. */
    val scopeOptions: List<EditScope> = EditScope.entries,
    /** Tâche récurrente : qui l'a faite, et quand. */
    val history: SeriesHistory? = null,
) {
    /** Liste affichée : enregistrée (modification) ou en cours de saisie (création). */
    val items: List<ChecklistItem>
        get() = if (isEdit) checklist else draft.checklist.mapIndexed { i, t -> ChecklistItem("draft-$i", t, false) }

    val isEdit: Boolean get() = original != null
    val readOnly: Boolean get() = original?.isLocal == true

    val isSeries: Boolean get() = original?.isRecurring == true

    /** Responsables pris en compte par la rotation (tâche personnelle : soi-même). */
    val assignees: List<String>
        get() = if (draft.personal) listOfNotNull(myMemberId) else draft.assigneeIds

    /** Répétition au format du contrat, calculée depuis [start] (date de la tâche par défaut). */
    fun recurrenceJson(start: LocalDate? = draft.date): JsonObject? =
        Recurrences.toJson(draft.recurrence, start, assignees, members, draft.personal)

    /** Série : la répétition ou la rotation a-t-elle été modifiée ? */
    val seriesChanged: Boolean
        get() = isSeries && series != null && recurrenceJson(series.startDate).toString() != initialRecurrence

    /** L'éditeur de répétition est affiché (pas pour une série qu'on n'a pas pu charger). */
    val canEditRecurrence: Boolean
        get() = !readOnly && (!isSeries || series != null)
}

enum class ScopeAction { SAVE, DELETE }

class TaskFormViewModel(
    private val repository: AgendaRepository,
    private val occurrenceId: String?,
    initialDate: LocalDate?,
) : ViewModel() {
    private val _state = MutableStateFlow(TaskFormState())
    val state: StateFlow<TaskFormState> = _state.asStateFlow()

    private var previewJob: Job? = null

    init {
        viewModelScope.launch {
            val members = repository.household.first()?.members.orEmpty()
            val me = repository.myMemberId.first()
            if (occurrenceId == null) {
                // Par défaut : « Ajouter au calendrier partagé » coché ; décoché automatiquement sans date.
                _state.value = TaskFormState(
                    loading = false,
                    draft = TaskDraft(date = initialDate, syncToCalendar = true),
                    members = members,
                    myMemberId = me,
                )
            } else {
                val o = repository.occurrence(occurrenceId).first()
                _state.value = if (o == null) TaskFormState(loading = false, error = FormError.NOT_FOUND)
                else TaskFormState(
                    loading = false,
                    original = o,
                    draft = TaskPayloads.draftOf(o),
                    checklist = o.checklist,
                    members = members,
                    myMemberId = me,
                )
                o?.seriesId?.takeIf { o.isRecurring }?.let { launch { loadSeries(it) } }
                repository.occurrence(occurrenceId).collect { fresh ->
                    if (fresh != null) _state.update { it.copy(checklist = fresh.checklist) }
                }
            }
        }
    }

    /** Pré-remplit la répétition et la rotation depuis la série. */
    private suspend fun loadSeries(seriesId: String) {
        viewModelScope.launch { repository.seriesHistory(seriesId)?.let { h -> _state.update { it.copy(history = h) } } }
        val series = repository.series(seriesId)
        if (series == null) return _state.update { it.copy(seriesUnavailable = true) }
        _state.update { s ->
            val (spec, assignees) = Recurrences.fromSeries(series, s.members)
            val next = s.copy(
                series = series,
                seriesUnavailable = false,
                draft = s.draft.copy(recurrence = spec, assigneeIds = assignees ?: s.draft.assigneeIds),
            )
            next.copy(initialRecurrence = next.recurrenceJson(series.startDate).toString())
        }
        schedulePreview()
    }

    fun retrySeries() {
        val id = _state.value.original?.seriesId ?: return
        viewModelScope.launch { loadSeries(id) }
    }

    /** Aperçu calculé par l'API, après une courte pause de saisie. */
    private fun schedulePreview() {
        previewJob?.cancel()
        val s = _state.value
        val date = s.draft.date
        val json = s.recurrenceJson()
        if (date == null || json == null) return _state.update { it.copy(preview = null) }
        previewJob = viewModelScope.launch {
            delay(300)
            val items = repository.previewRecurrence(date, json)
            _state.update { it.copy(preview = items) }
        }
    }

    // ───────── Sous-tâches ─────────

    fun addItem(text: String) {
        val value = text.trim()
        if (value.isEmpty()) return
        val o = _state.value.original
        if (o == null) return edit { it.copy(checklist = it.checklist + value) }
        checklistOp { repository.addChecklistItem(o.id, value) }
    }

    fun toggleItem(item: ChecklistItem) {
        val o = _state.value.original ?: return
        checklistOp { repository.setChecklistItemDone(o.id, item.id, !item.done) }
    }

    fun removeItem(item: ChecklistItem) {
        val o = _state.value.original
        if (o == null) {
            val index = item.id.removePrefix("draft-").toIntOrNull() ?: return
            return edit { d -> d.copy(checklist = d.checklist.filterIndexed { i, _ -> i != index }) }
        }
        checklistOp { repository.removeChecklistItem(o.id, item.id) }
    }

    private fun checklistOp(op: suspend () -> OpResult) {
        _state.update { it.copy(checklistError = null) }
        viewModelScope.launch {
            val error = when (op()) {
                OpResult.Ok -> null
                OpResult.Offline -> FormError.OFFLINE
                OpResult.NotFound -> FormError.NOT_FOUND
                else -> FormError.GENERIC
            }
            _state.update { it.copy(checklistError = error) }
        }
    }

    fun edit(transform: (TaskDraft) -> TaskDraft) = _state.update {
        val next = transform(it.draft)
        // Une répétition exige une date : aujourd'hui par défaut.
        val withDate = if (next.recurrence.repeating && next.date == null) next.copy(date = LocalDate.now()) else next
        it.copy(draft = withDate, error = null)
    }.also { schedulePreview() }

    fun save() {
        val s = _state.value
        if (s.draft.title.isBlank()) return _state.update { it.copy(error = FormError.TITLE_REQUIRED) }
        val original = s.original
        if (original == null) {
            _state.update { it.copy(saving = true) }
            viewModelScope.launch {
                repository.create(s.draft)
                _state.update { it.copy(saving = false, done = true) }
            }
        } else if (original.isRecurring) {
            val options = if (s.seriesChanged) listOf(EditScope.FOLLOWING, EditScope.ALL) else EditScope.entries
            _state.update { it.copy(askScopeFor = ScopeAction.SAVE, scopeOptions = options) }
        } else {
            saveWithScope(EditScope.THIS)
        }
    }

    fun requestDelete() = _state.update { it.copy(confirmDelete = true) }

    fun confirmDelete() {
        val o = _state.value.original ?: return
        _state.update { it.copy(confirmDelete = false) }
        if (o.isRecurring) _state.update { it.copy(askScopeFor = ScopeAction.DELETE, scopeOptions = EditScope.entries) }
        else deleteWithScope(EditScope.THIS)
    }

    fun dismissDialogs() = _state.update { it.copy(askScopeFor = null, confirmDelete = false) }

    fun onScope(scope: EditScope) {
        val action = _state.value.askScopeFor ?: return
        _state.update { it.copy(askScopeFor = null) }
        if (action == ScopeAction.SAVE) saveWithScope(scope) else deleteWithScope(scope)
    }

    private fun saveWithScope(scope: EditScope) {
        val s = _state.value
        val recurrence = when {
            // Tâche ponctuelle rendue récurrente.
            !s.isSeries -> s.recurrenceJson()
            // Répétition inchangée : on ne l'envoie pas, pour que la rotation continue au même tour.
            scope != EditScope.THIS && s.seriesChanged -> s.recurrenceJson()
            else -> null
        }
        execute { o -> repository.update(o, s.draft, scope, recurrence) }
    }

    /** Reporter en un geste (cette occurrence, heure conservée). */
    fun postpone(date: LocalDate) = execute { o -> repository.move(o.id, date) }

    private fun deleteWithScope(scope: EditScope) = execute { o -> repository.delete(o, scope) }

    private fun execute(op: suspend (Occurrence) -> OpResult) {
        val o = _state.value.original ?: return
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            when (op(o)) {
                OpResult.Ok -> _state.update { it.copy(saving = false, done = true) }
                OpResult.Offline -> _state.update { it.copy(saving = false, error = FormError.OFFLINE) }
                OpResult.Conflict -> {
                    // Recharge la version serveur dans le formulaire.
                    val fresh = repository.occurrence(o.id).first()
                    _state.update {
                        it.copy(
                            saving = false,
                            error = FormError.CONFLICT,
                            original = fresh ?: it.original,
                            draft = fresh?.let(TaskPayloads::draftOf) ?: it.draft,
                        )
                    }
                }
                OpResult.NotFound -> _state.update { it.copy(saving = false, error = FormError.NOT_FOUND) }
                is OpResult.Failed -> _state.update { it.copy(saving = false, error = FormError.GENERIC) }
            }
        }
    }
}
