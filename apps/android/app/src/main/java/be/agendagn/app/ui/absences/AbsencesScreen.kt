package be.agendagn.app.ui.absences

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import be.agendagn.app.R
import be.agendagn.app.data.AbsencesRemote
import be.agendagn.app.data.remote.AbsenceDto
import be.agendagn.app.domain.model.Member
import be.agendagn.app.ui.components.currentLocale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class AbsencesState(
    val items: List<AbsenceDto> = emptyList(),
    val loading: Boolean = true,
    val offline: Boolean = false,
    val saving: Boolean = false,
)

class AbsencesViewModel(private val remote: AbsencesRemote) : ViewModel() {
    private val _state = MutableStateFlow(AbsencesState())
    val state: StateFlow<AbsencesState> = _state

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val items = remote.list()
            _state.update { it.copy(items = items.orEmpty(), loading = false, offline = items == null) }
        }
    }

    fun add(memberId: String, start: LocalDate, end: LocalDate, done: (Boolean) -> Unit) {
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val ok = remote.create(memberId, start, end)
            _state.update { it.copy(saving = false) }
            done(ok)
            if (ok) load()
        }
    }

    fun delete(item: AbsenceDto, done: (Boolean) -> Unit) {
        viewModelScope.launch {
            val ok = remote.delete(item.id)
            done(ok)
            if (ok) load()
        }
    }
}

/** Mode absence : pendant l'absence, les tâches partagées passent à l'autre (rotation comprise). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AbsencesScreen(
    vm: AbsencesViewModel,
    members: List<Member>,
    myMemberId: String?,
    onBack: () -> Unit,
    onMessage: (String) -> Unit,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val locale = currentLocale()
    val format = remember(locale) { DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale) }
    val name = { id: String -> members.firstOrNull { it.id == id }?.displayName ?: "—" }
    var who by rememberSaveable { mutableStateOf(myMemberId ?: members.firstOrNull()?.id.orEmpty()) }
    var picking by remember { mutableStateOf(false) }
    val added = stringResource(R.string.absence_added)
    val removed = stringResource(R.string.absence_removed)
    val failed = stringResource(R.string.absence_failed)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.absences_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.absences_intro),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (state.offline) {
                Text(stringResource(R.string.history_offline))
                OutlinedButton(onClick = vm::load) { Text(stringResource(R.string.retry)) }
            }
            state.items.forEach { a ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(start = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            stringResource(
                                R.string.absence_item,
                                name(a.memberId),
                                LocalDate.parse(a.startDate).format(format),
                                LocalDate.parse(a.endDate).format(format),
                            ),
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.weight(1f).padding(vertical = 12.dp),
                        )
                        IconButton(onClick = { vm.delete(a) { ok -> onMessage(if (ok) removed else failed) } }) {
                            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.absence_remove, name(a.memberId)))
                        }
                    }
                }
            }
            if (members.size > 1 && !state.offline) {
                Text(stringResource(R.string.absence_who), style = MaterialTheme.typography.titleSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    members.forEach { m ->
                        FilterChip(selected = who == m.id, onClick = { who = m.id }, label = { Text(m.displayName) })
                    }
                }
                Button(
                    onClick = { picking = true },
                    enabled = who.isNotEmpty() && !state.saving,
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.absence_add)) }
            }
        }
    }

    if (picking) {
        val today = LocalDate.now()
        val todayMs = today.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val picker = rememberDateRangePickerState(
            initialSelectedStartDateMillis = todayMs,
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis >= todayMs
            },
        )
        val toDate = { ms: Long -> Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate() }
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(
                    enabled = picker.selectedStartDateMillis != null,
                    onClick = {
                        val start = toDate(picker.selectedStartDateMillis!!)
                        val end = picker.selectedEndDateMillis?.let(toDate) ?: start
                        picking = false
                        vm.add(who, start, end) { ok -> onMessage(if (ok) added else failed) }
                    },
                ) { Text(stringResource(R.string.absence_add)) }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text(stringResource(android.R.string.cancel)) } },
        ) {
            DateRangePicker(state = picker, modifier = Modifier.weight(1f))
        }
    }
}
