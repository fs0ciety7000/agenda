package app.tandem.foyer.ui.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.tandem.foyer.R
import app.tandem.foyer.data.ActivityRemote
import app.tandem.foyer.data.remote.ActivityDto
import app.tandem.foyer.data.remote.TrashItemDto
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.ui.components.currentLocale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class HistoryState(
    val activity: List<ActivityDto> = emptyList(),
    val next: String? = null,
    val trash: List<TrashItemDto> = emptyList(),
    val loading: Boolean = true,
    /** Chargement impossible (hors ligne). */
    val offline: Boolean = false,
    val restoring: String? = null,
)

class HistoryViewModel(private val remote: ActivityRemote) : ViewModel() {
    private val _state = MutableStateFlow(HistoryState())
    val state: StateFlow<HistoryState> = _state

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, offline = false) }
        viewModelScope.launch {
            val page = remote.activity()
            val trash = remote.trash()
            _state.update {
                it.copy(
                    activity = page?.items.orEmpty(),
                    next = page?.next,
                    trash = trash.orEmpty(),
                    loading = false,
                    offline = page == null || trash == null,
                )
            }
        }
    }

    fun more() {
        val before = _state.value.next ?: return
        viewModelScope.launch {
            remote.activity(before)?.let { page ->
                _state.update { it.copy(activity = it.activity + page.items, next = page.next) }
            }
        }
    }

    /** Renvoie true si l'élément a été restauré. */
    fun restore(item: TrashItemDto, done: (Boolean) -> Unit) {
        _state.update { it.copy(restoring = item.id) }
        viewModelScope.launch {
            val ok = remote.restore(item.id)
            _state.update { s ->
                s.copy(restoring = null, trash = if (ok) s.trash.filterNot { it.id == item.id } else s.trash)
            }
            done(ok)
            if (ok) remote.activity()?.let { page -> _state.update { it.copy(activity = page.items, next = page.next) } }
        }
    }
}

/** Clé de libellé (strings.xml) d'une action du journal. */
internal fun actionLabel(action: String): Int = when (action) {
    "task.created" -> R.string.activity_task_created
    "occurrence.completed" -> R.string.activity_completed
    "occurrence.reopened" -> R.string.activity_reopened
    "task.deleted" -> R.string.activity_deleted
    "occurrence.cancelled" -> R.string.activity_cancelled
    "series.ended" -> R.string.activity_series_ended
    "task.restored", "occurrence.restored", "series.restored" -> R.string.activity_restored
    "series.created" -> R.string.activity_series_created
    "series.split", "series.updated" -> R.string.activity_series_updated
    "attachment.added" -> R.string.activity_attachment_added
    "attachment.deleted" -> R.string.activity_attachment_deleted
    "absence.created" -> R.string.activity_absence_created
    "absence.deleted" -> R.string.activity_absence_deleted
    else -> R.string.activity_updated
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    vm: HistoryViewModel,
    members: List<Member>,
    onBack: () -> Unit,
    onMessage: (String) -> Unit,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val restoredMsg = stringResource(R.string.trash_restored)
    val failedMsg = stringResource(R.string.trash_restore_failed)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.history_screen_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            PrimaryTabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text(stringResource(R.string.history_tab_log)) })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text(stringResource(R.string.history_tab_trash)) })
            }
            when {
                state.loading -> Row(Modifier.fillMaxWidth().padding(32.dp), horizontalArrangement = Arrangement.Center) {
                    CircularProgressIndicator()
                }
                state.offline -> Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(stringResource(R.string.history_offline))
                    OutlinedButton(onClick = vm::load) { Text(stringResource(R.string.retry)) }
                }
                tab == 0 -> ActivityList(state, members, vm::more)
                else -> TrashList(state, members) { item ->
                    vm.restore(item) { ok -> onMessage(if (ok) restoredMsg else failedMsg) }
                }
            }
        }
    }
}

@Composable
private fun who(members: List<Member>, id: String?): String =
    if (id == null) stringResource(R.string.activity_system)
    else members.firstOrNull { it.id == id }?.displayName ?: stringResource(R.string.history_former_member)

@Composable
private fun ActivityList(state: HistoryState, members: List<Member>, onMore: () -> Unit) {
    val locale = currentLocale()
    val zone = ZoneId.systemDefault()
    val time = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withLocale(locale)
    if (state.activity.isEmpty()) {
        Text(stringResource(R.string.history_empty), Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
        items(state.activity, key = { it.id }) { a ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                Text(
                    "${who(members, a.actorId)} ${stringResource(actionLabel(a.action))} « ${a.title ?: "—"} »",
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text(
                    runCatching { time.format(Instant.parse(a.at).atZone(zone)) }.getOrDefault(a.at),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            HorizontalDivider()
        }
        if (state.next != null) {
            item {
                TextButton(onClick = onMore, modifier = Modifier.fillMaxWidth().padding(8.dp)) {
                    Text(stringResource(R.string.history_more))
                }
            }
        }
    }
}

@Composable
private fun TrashList(state: HistoryState, members: List<Member>, onRestore: (TrashItemDto) -> Unit) {
    val locale = currentLocale()
    val day = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale)
    Column {
        Text(
            stringResource(R.string.trash_intro),
            Modifier.padding(16.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (state.trash.isEmpty()) {
            Text(stringResource(R.string.trash_empty), Modifier.padding(horizontal = 16.dp))
            return
        }
        LazyColumn {
            items(state.trash, key = { it.id }) { item ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(item.title.ifBlank { "—" }, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                        val purge = runCatching { day.format(Instant.parse(item.purgeAt).atZone(ZoneId.systemDefault())) }.getOrDefault("")
                        val date = item.date?.let { runCatching { day.format(LocalDate.parse(it)) }.getOrNull() }
                        Text(
                            listOfNotNull(date, stringResource(R.string.trash_deleted_by, who(members, item.deletedById)), stringResource(R.string.trash_purge_on, purge))
                                .joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    OutlinedButton(onClick = { onRestore(item) }, enabled = state.restoring == null) {
                        Text(stringResource(R.string.trash_restore))
                    }
                }
                HorizontalDivider()
            }
        }
    }
}
