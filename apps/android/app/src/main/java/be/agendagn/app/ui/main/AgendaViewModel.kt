package be.agendagn.app.ui.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.agendagn.app.domain.model.Category
import be.agendagn.app.domain.model.Household
import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.QuickAddPreview
import be.agendagn.app.domain.repository.AgendaRepository
import be.agendagn.app.domain.repository.OpResult
import be.agendagn.app.domain.repository.RefreshOutcome
import be.agendagn.app.domain.repository.SyncState
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

/** Tout ce que les onglets affichent : lu depuis le cache local, donc disponible hors ligne. */
data class AgendaUiState(
    /** null = pas encore chargé (premier lancement). */
    val loaded: Boolean = false,
    val household: Household? = null,
    val myMemberId: String? = null,
    val occurrences: List<Occurrence> = emptyList(),
    val categories: List<Category> = emptyList(),
    val today: LocalDate = LocalDate.now(),
    val online: Boolean = true,
    val sync: SyncState = SyncState(),
) {
    val members: Map<String, Member> get() = household?.members.orEmpty().associateBy { it.id }
    val me: Member? get() = myMemberId?.let { members[it] }
}

/** Messages ponctuels (snackbar). */
sealed interface AgendaEvent {
    data class Moved(val occurrenceId: String, val title: String, val from: LocalDate, val to: LocalDate) : AgendaEvent
    data class MoveFailed(val result: OpResult) : AgendaEvent
}

data class QuickAddState(val text: String = "", val preview: QuickAddPreview? = null)

@OptIn(FlowPreview::class)
class AgendaViewModel(
    private val repository: AgendaRepository,
    online: Flow<Boolean> = flowOf(true),
    private val clock: Clock = Clock.systemDefaultZone(),
) : ViewModel() {
    private val loaded = MutableStateFlow(false)

    val state: StateFlow<AgendaUiState> = combine(
        combine(repository.household, repository.myMemberId, ::Pair),
        repository.occurrences,
        repository.categories,
        combine(online, repository.syncState, ::Pair),
        loaded,
    ) { (household, me), occurrences, categories, (isOnline, sync), isLoaded ->
        AgendaUiState(
            loaded = isLoaded || household != null,
            household = household,
            myMemberId = me,
            occurrences = occurrences,
            categories = categories,
            today = LocalDate.now(clock.withZone(household?.timezone?.let(ZoneId::of) ?: clock.zone)),
            online = isOnline,
            sync = sync,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, AgendaUiState())

    private val _quickAdd = MutableStateFlow(QuickAddState())
    val quickAdd: StateFlow<QuickAddState> = _quickAdd

    init {
        // Au lancement puis à chaque retour du réseau : envoi des actions en attente et rechargement.
        online.distinctUntilChanged().onEach { if (it) refresh() }.launchIn(viewModelScope)
        // Aperçu du quick add (analyse serveur), sans spammer l'API à chaque lettre.
        _quickAdd.debounce(400).onEach { qa ->
            val text = qa.text.trim()
            val preview = if (text.length >= 3) repository.previewQuickAdd(text) else null
            _quickAdd.update { if (it.text.trim() == text) it.copy(preview = preview) else it }
        }.launchIn(viewModelScope)
    }

    fun refresh() {
        viewModelScope.launch {
            val outcome = repository.refresh()
            if (outcome != RefreshOutcome.OFFLINE) loaded.value = true
        }
    }

    fun toggle(o: Occurrence) {
        viewModelScope.launch { repository.toggle(o) }
    }

    private val _events = MutableSharedFlow<AgendaEvent>(extraBufferCapacity = 4)
    val events: SharedFlow<AgendaEvent> = _events

    /** Glisser-déposer du calendrier ; `undo` = retour au jour d'origine, sans nouveau message. */
    fun move(o: Occurrence, to: LocalDate, undo: Boolean = false) {
        val from = o.date ?: return
        if (from == to || o.isLocal) return
        viewModelScope.launch {
            when (val result = repository.move(o.id, to)) {
                OpResult.Ok -> if (!undo) _events.emit(AgendaEvent.Moved(o.id, o.title, from, to))
                else -> _events.emit(AgendaEvent.MoveFailed(result))
            }
        }
    }

    fun onQuickAddText(text: String) = _quickAdd.update { it.copy(text = text, preview = null) }

    fun submitQuickAdd(): Boolean {
        val text = _quickAdd.value.text.trim()
        if (text.isEmpty()) return false
        _quickAdd.value = QuickAddState()
        viewModelScope.launch { repository.quickAdd(text) }
        return true
    }
}
