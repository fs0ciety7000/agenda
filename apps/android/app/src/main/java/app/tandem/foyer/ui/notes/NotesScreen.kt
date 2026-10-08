package app.tandem.foyer.ui.notes

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.tandem.foyer.R
import app.tandem.foyer.data.NotesRemote
import app.tandem.foyer.data.remote.NoteDto
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.ui.components.EmptyState
import app.tandem.foyer.ui.components.currentLocale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class NotesState(
    val items: List<NoteDto> = emptyList(),
    val loading: Boolean = true,
    val offline: Boolean = false,
    val saving: Boolean = false,
)

class NotesViewModel(private val remote: NotesRemote) : ViewModel() {
    private val _state = MutableStateFlow(NotesState())
    val state: StateFlow<NotesState> = _state

    init {
        load()
        // Modifiées ailleurs (temps réel) : relues.
        viewModelScope.launch { remote.updates.collect { load() } }
    }

    fun load() {
        viewModelScope.launch {
            val items = remote.list()
            _state.update {
                it.copy(items = items ?: it.items, loading = false, offline = items == null)
            }
        }
    }

    fun create(title: String, body: String, pinned: Boolean, done: (Boolean) -> Unit) = save(done) {
        remote.create(title, body, pinned)
    }

    /** null = enregistrée ; sinon la note telle que l'autre l'a laissée (ou rien si échec). */
    fun update(note: NoteDto, title: String?, body: String?, pinned: Boolean?, done: (NotesRemote.SaveResult) -> Unit) {
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = remote.update(note, title, body, pinned)
            _state.update { it.copy(saving = false) }
            done(result)
            load()
        }
    }

    fun delete(note: NoteDto, done: (Boolean) -> Unit) = save(done) { remote.delete(note.id) }

    private fun save(done: (Boolean) -> Unit, action: suspend () -> Boolean) {
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val ok = action()
            _state.update { it.copy(saving = false) }
            done(ok)
            if (ok) load()
        }
    }
}

/** Ce qu'on édite : une note existante (avec sa version) ou une nouvelle. */
private data class Draft(val note: NoteDto?, val title: String, val body: String, val pinned: Boolean, val conflict: Boolean = false)

/** Notes partagées : codes Wi-Fi, mesures, idées cadeaux. Épinglées d'abord. En ligne seulement. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(
    vm: NotesViewModel,
    members: List<Member>,
    onBack: () -> Unit,
    onMessage: (String) -> Unit,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    var draft by remember { mutableStateOf<Draft?>(null) }
    val context = LocalContext.current
    val failed = stringResource(R.string.notes_failed)
    val created = stringResource(R.string.notes_created)
    val saved = stringResource(R.string.notes_saved)
    val copiedFmt = stringResource(R.string.notes_copied)
    val deletedFmt = stringResource(R.string.notes_deleted)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.notes_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
                    }
                },
            )
        },
        floatingActionButton = {
            if (!state.offline && state.items.isNotEmpty()) {
                ExtendedFloatingActionButton(
                    onClick = { draft = Draft(null, "", "", false) },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text(stringResource(R.string.notes_new)) },
                )
            }
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.offline) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.notes_offline), style = MaterialTheme.typography.bodyMedium)
                        OutlinedButton(onClick = vm::load) { Text(stringResource(R.string.retry)) }
                    }
                }
            }
            if (!state.loading && !state.offline && state.items.isEmpty()) {
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        EmptyState(stringResource(R.string.notes_empty_title), stringResource(R.string.notes_empty_body))
                        Button(onClick = { draft = Draft(null, "", "", false) }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.notes_new))
                        }
                    }
                }
            }
            items(state.items, key = { it.id }) { n ->
                NoteCard(
                    n,
                    members,
                    enabled = !state.offline,
                    onPin = {
                        vm.update(n, null, null, !n.pinned) { r -> if (r is NotesRemote.SaveResult.Failed) onMessage(failed) }
                    },
                    onCopy = {
                        context.getSystemService(ClipboardManager::class.java)
                            ?.setPrimaryClip(ClipData.newPlainText(n.title, n.body.ifBlank { n.title }))
                        onMessage(copiedFmt.format(n.title))
                    },
                    onEdit = { draft = Draft(n, n.title, n.body, n.pinned) },
                )
            }
        }
    }

    draft?.let { d ->
        NoteSheet(
            d,
            saving = state.saving,
            onChange = { draft = it },
            onDismiss = { draft = null },
            onSave = {
                if (d.note == null) {
                    vm.create(d.title, d.body, d.pinned) { ok ->
                        if (ok) draft = null
                        onMessage(if (ok) created else failed)
                    }
                } else {
                    vm.update(d.note, d.title, d.body, d.pinned) { r ->
                        when (r) {
                            is NotesRemote.SaveResult.Saved -> {
                                draft = null
                                onMessage(saved)
                            }
                            // Modifiée par l'autre entre-temps : sa version s'affiche, on peut réenregistrer.
                            is NotesRemote.SaveResult.Conflict ->
                                draft = Draft(r.current, r.current.title, r.current.body, r.current.pinned, conflict = true)
                            NotesRemote.SaveResult.Failed -> onMessage(failed)
                        }
                    }
                }
            },
            onDelete = {
                d.note?.let { note ->
                    vm.delete(note) { ok ->
                        if (ok) draft = null
                        onMessage(if (ok) deletedFmt.format(note.title) else failed)
                    }
                }
            },
        )
    }
}

@Composable
private fun NoteCard(
    n: NoteDto,
    members: List<Member>,
    enabled: Boolean,
    onPin: () -> Unit,
    onCopy: () -> Unit,
    onEdit: () -> Unit,
) {
    val locale = currentLocale()
    val date = remember(n.updatedAt, locale) {
        DateTimeFormatter.ofPattern("d MMM", locale).format(Instant.parse(n.updatedAt).atZone(ZoneId.systemDefault()))
    }
    val by = members.firstOrNull { it.id == n.updatedById }?.displayName ?: stringResource(R.string.notes_someone)
    val copyLabel = stringResource(R.string.notes_copy, n.title)
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    n.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                IconToggleButton(checked = n.pinned, onCheckedChange = { onPin() }, enabled = enabled) {
                    Icon(
                        if (n.pinned) Icons.Filled.Star else Icons.Outlined.Star,
                        contentDescription = stringResource(if (n.pinned) R.string.notes_unpin else R.string.notes_pin, n.title),
                        tint = if (n.pinned) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = onEdit, enabled = enabled) {
                    Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.notes_edit_one, n.title), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (n.body.isNotBlank()) {
                Text(n.body, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(end = 12.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                // L'épinglage se lit aussi en texte, pas seulement à la couleur de l'étoile.
                val updated = stringResource(R.string.notes_updated, date, by)
                Text(
                    if (n.pinned) stringResource(R.string.notes_pinned_meta, updated) else updated,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onCopy, modifier = Modifier.heightIn(min = 48.dp).semantics {
                    contentDescription = copyLabel
                }) { Text(stringResource(R.string.notes_copy_short)) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NoteSheet(
    d: Draft,
    saving: Boolean,
    onChange: (Draft) -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
    onDelete: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(if (d.note == null) R.string.notes_new else R.string.notes_edit),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
            if (d.conflict) {
                Text(stringResource(R.string.notes_conflict), style = MaterialTheme.typography.bodyMedium)
            }
            OutlinedTextField(
                value = d.title,
                onValueChange = { onChange(d.copy(title = it.take(120))) },
                label = { Text(stringResource(R.string.notes_field_title)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = d.body,
                onValueChange = { onChange(d.copy(body = it.take(4000))) },
                label = { Text(stringResource(R.string.notes_field_body)) },
                minLines = 4,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.heightIn(min = 48.dp)) {
                Checkbox(checked = d.pinned, onCheckedChange = { onChange(d.copy(pinned = it)) })
                Text(stringResource(R.string.notes_field_pinned), style = MaterialTheme.typography.bodyLarge)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (d.note != null) {
                    TextButton(onClick = onDelete, enabled = !saving, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(stringResource(R.string.notes_delete), color = MaterialTheme.colorScheme.error)
                    }
                }
                Spacer(Modifier.weight(1f))
                Button(onClick = onSave, enabled = d.title.isNotBlank() && !saving, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(if (d.note == null) R.string.notes_add else R.string.notes_save))
                }
            }
        }
    }
}
