package be.agendagn.app.ui.taskform

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.agendagn.app.domain.TaskPayloads
import be.agendagn.app.domain.model.ChecklistItem
import be.agendagn.app.domain.model.EditScope
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.Repeat
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.domain.repository.AgendaRepository
import be.agendagn.app.domain.repository.OpResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
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
) {
    /** Liste affichée : enregistrée (modification) ou en cours de saisie (création). */
    val items: List<ChecklistItem>
        get() = if (isEdit) checklist else draft.checklist.mapIndexed { i, t -> ChecklistItem("draft-$i", t, false) }

    val isEdit: Boolean get() = original != null
    val readOnly: Boolean get() = original?.isLocal == true
}

enum class ScopeAction { SAVE, DELETE }

class TaskFormViewModel(
    private val repository: AgendaRepository,
    private val occurrenceId: String?,
    initialDate: LocalDate?,
) : ViewModel() {
    private val _state = MutableStateFlow(TaskFormState())
    val state: StateFlow<TaskFormState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            if (occurrenceId == null) {
                // Par défaut : « Ajouter au calendrier partagé » coché ; décoché automatiquement sans date.
                _state.value = TaskFormState(loading = false, draft = TaskDraft(date = initialDate, syncToCalendar = true))
            } else {
                val o = repository.occurrence(occurrenceId).first()
                _state.value = if (o == null) TaskFormState(loading = false, error = FormError.NOT_FOUND)
                else TaskFormState(loading = false, original = o, draft = TaskPayloads.draftOf(o), checklist = o.checklist)
                repository.occurrence(occurrenceId).collect { fresh ->
                    if (fresh != null) _state.update { it.copy(checklist = fresh.checklist) }
                }
            }
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
        val withDate = if (next.repeat != Repeat.NONE && next.date == null) next.copy(date = LocalDate.now()) else next
        it.copy(draft = withDate, error = null)
    }

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
            _state.update { it.copy(askScopeFor = ScopeAction.SAVE) }
        } else {
            saveWithScope(EditScope.THIS)
        }
    }

    fun requestDelete() = _state.update { it.copy(confirmDelete = true) }

    fun confirmDelete() {
        val o = _state.value.original ?: return
        _state.update { it.copy(confirmDelete = false) }
        if (o.isRecurring) _state.update { it.copy(askScopeFor = ScopeAction.DELETE) } else deleteWithScope(EditScope.THIS)
    }

    fun dismissDialogs() = _state.update { it.copy(askScopeFor = null, confirmDelete = false) }

    fun onScope(scope: EditScope) {
        val action = _state.value.askScopeFor ?: return
        _state.update { it.copy(askScopeFor = null) }
        if (action == ScopeAction.SAVE) saveWithScope(scope) else deleteWithScope(scope)
    }

    private fun saveWithScope(scope: EditScope) = execute { o -> repository.update(o, _state.value.draft, scope) }

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
