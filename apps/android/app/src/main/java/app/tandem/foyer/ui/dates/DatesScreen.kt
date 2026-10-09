package app.tandem.foyer.ui.dates

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.tandem.foyer.R
import app.tandem.foyer.data.DatesRemote
import app.tandem.foyer.data.remote.ImportantDateBody
import app.tandem.foyer.data.remote.ImportantDateDto
import app.tandem.foyer.ui.components.EmptyState
import app.tandem.foyer.ui.components.SectionHeader
import app.tandem.foyer.ui.components.currentLocale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

data class DatesState(
    val items: List<ImportantDateDto> = emptyList(),
    val loading: Boolean = true,
    val offline: Boolean = false,
    val saving: Boolean = false,
)

class DatesViewModel(private val remote: DatesRemote) : ViewModel() {
    private val _state = MutableStateFlow(DatesState())
    val state: StateFlow<DatesState> = _state

    init {
        load()
        viewModelScope.launch { remote.updates.collect { load() } }
    }

    fun load() {
        viewModelScope.launch {
            // Hors ligne : la dernière liste lue s'affiche tout de suite, en lecture.
            if (_state.value.items.isEmpty()) {
                remote.cached()?.let { c -> _state.update { it.copy(items = c, loading = false) } }
            }
            val items = remote.list()
            _state.update { it.copy(items = items ?: it.items, loading = false, offline = items == null) }
        }
    }

    fun save(id: String?, body: ImportantDateBody, done: (Boolean) -> Unit) = run(done) { remote.save(id, body) }

    fun delete(id: String, done: (Boolean) -> Unit) = run(done) { remote.delete(id) }

    private fun run(done: (Boolean) -> Unit, action: suspend () -> Boolean) {
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val ok = action()
            _state.update { it.copy(saving = false) }
            done(ok)
            if (ok) load()
        }
    }
}

private val KINDS = listOf("BIRTHDAY", "ANNIVERSARY", "MAINTENANCE", "OTHER")
private val REMINDERS = listOf(0, 1, 3, 7, 14, 30)

private data class Draft(
    val id: String?,
    val title: String,
    val kind: String,
    /** Jour et mois choisis ; l'année ne compte que si [withYear] ou si la date est unique. */
    val date: LocalDate,
    val withYear: Boolean,
    val repeatsYearly: Boolean,
    val remindDaysBefore: Int,
)

/** Icône du type de date, comme sur le site (décorative : le type est écrit à côté). */
@Composable
internal fun DateKindIcon(kind: String) {
    Icon(
        painterResource(
            when (kind) {
                "BIRTHDAY" -> R.drawable.ic_drawer_cake
                "ANNIVERSARY" -> R.drawable.ic_date_anniversary
                "MAINTENANCE" -> R.drawable.ic_date_maintenance
                else -> R.drawable.ic_date_other
            },
        ),
        contentDescription = null,
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.size(20.dp),
    )
}

@Composable
private fun kindLabel(kind: String) = stringResource(
    when (kind) {
        "BIRTHDAY" -> R.string.dates_kind_birthday
        "ANNIVERSARY" -> R.string.dates_kind_anniversary
        "MAINTENANCE" -> R.string.dates_kind_maintenance
        else -> R.string.dates_kind_other
    },
)

/** « dans 5 jours · 76 ans » : relatif à aujourd'hui, l'âge seulement s'il a un sens. */
@Composable
fun dateSummary(d: ImportantDateDto, locale: Locale): String {
    val next = d.nextDate ?: return stringResource(R.string.dates_past)
    val day = DateTimeFormatter.ofPattern("EEEE d MMMM", locale).format(LocalDate.parse(next))
    val days = d.daysLeft ?: 0
    val parts = mutableListOf(day, whenText(days))
    if (d.years != null && d.kind != "MAINTENANCE") parts += pluralStringResource(R.plurals.dates_years, d.years, d.years)
    return parts.joinToString(" · ")
}

/** « aujourd'hui », « demain », « dans 5 jours ». */
@Composable
fun whenText(days: Int): String = when (days) {
    0 -> stringResource(R.string.dates_today)
    1 -> stringResource(R.string.dates_tomorrow)
    else -> pluralStringResource(R.plurals.dates_when, days, days)
}

/** Libellé du rappel : « Le jour même », « La veille », « 7 jours avant ». */
@Composable
private fun remindText(days: Int): String = when (days) {
    0 -> stringResource(R.string.dates_remind_same_day)
    1 -> stringResource(R.string.dates_remind_day_before)
    else -> pluralStringResource(R.plurals.dates_remind, days, days)
}

/** Dates importantes : anniversaires, fêtes, entretiens annuels, rappelés à l'avance. En ligne. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatesScreen(vm: DatesViewModel, onBack: () -> Unit, onMessage: (String) -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val locale = currentLocale()
    var draft by remember { mutableStateOf<Draft?>(null) }
    val failed = stringResource(R.string.dates_failed)
    val created = stringResource(R.string.dates_created)
    val saved = stringResource(R.string.dates_saved)
    val deletedFmt = stringResource(R.string.dates_deleted)
    val newDraft = { Draft(null, "", "BIRTHDAY", LocalDate.now(), withYear = false, repeatsYearly = true, remindDaysBefore = 7) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.dates_title)) },
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
                    onClick = { draft = newDraft() },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text(stringResource(R.string.dates_new)) },
                )
            }
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text(
                    stringResource(R.string.dates_intro),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (state.offline) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.dates_offline), style = MaterialTheme.typography.bodyMedium)
                        OutlinedButton(onClick = vm::load) { Text(stringResource(R.string.retry)) }
                    }
                }
            }
            if (!state.loading && !state.offline && state.items.isEmpty()) {
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        EmptyState(stringResource(R.string.dates_empty_title), stringResource(R.string.dates_empty_body), illustration = R.drawable.ill_empty_dates)
                        Button(onClick = { draft = newDraft() }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.dates_new))
                        }
                    }
                }
            }
            items(state.items, key = { it.id }) { d ->
                OutlinedCard(
                    onClick = {
                        draft = Draft(
                            d.id, d.title, d.kind,
                            LocalDate.of(d.year ?: 2024, d.month, d.day),
                            withYear = d.year != null, repeatsYearly = d.repeatsYearly, remindDaysBefore = d.remindDaysBefore,
                        )
                    },
                    enabled = !state.offline,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        DateKindIcon(d.kind)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(d.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                            Text(
                                "${kindLabel(d.kind)} · ${dateSummary(d, locale)}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (d.nextDate != null) {
                            Text(
                                if (d.remindDaysBefore == 0) stringResource(R.string.dates_remind_short_same_day)
                                else pluralStringResource(R.plurals.dates_remind_short, d.remindDaysBefore, d.remindDaysBefore),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }
        }
    }

    draft?.let { d ->
        DateSheet(
            d,
            saving = state.saving,
            onChange = { draft = it },
            onDismiss = { draft = null },
            onSave = {
                val body = ImportantDateBody(
                    title = d.title.trim(),
                    kind = d.kind,
                    month = d.date.monthValue,
                    day = d.date.dayOfMonth,
                    year = if (d.withYear || !d.repeatsYearly) d.date.year else null,
                    repeatsYearly = d.repeatsYearly,
                    remindDaysBefore = d.remindDaysBefore,
                )
                vm.save(d.id, body) { ok ->
                    if (ok) draft = null
                    onMessage(if (!ok) failed else if (d.id == null) created else saved)
                }
            },
            onDelete = {
                d.id?.let { id ->
                    vm.delete(id) { ok ->
                        if (ok) draft = null
                        onMessage(if (ok) deletedFmt.format(d.title) else failed)
                    }
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun DateSheet(
    d: Draft,
    saving: Boolean,
    onChange: (Draft) -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
    onDelete: () -> Unit,
) {
    val locale = currentLocale()
    var picking by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(if (d.id == null) R.string.dates_new else R.string.dates_edit),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
            OutlinedTextField(
                value = d.title,
                onValueChange = { onChange(d.copy(title = it.take(120))) },
                label = { Text(stringResource(R.string.dates_field_title)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(stringResource(R.string.dates_field_kind), style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KINDS.forEach { k -> FilterChip(selected = d.kind == k, onClick = { onChange(d.copy(kind = k)) }, label = { Text(kindLabel(k)) }) }
            }
            val withYear = d.withYear || !d.repeatsYearly
            OutlinedButton(onClick = { picking = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(
                    stringResource(
                        R.string.dates_field_date,
                        DateTimeFormatter.ofPattern(if (withYear) "d MMMM yyyy" else "d MMMM", locale).format(d.date),
                    ),
                )
            }
            CheckRow(stringResource(R.string.dates_field_repeats), d.repeatsYearly) { onChange(d.copy(repeatsYearly = it)) }
            if (d.repeatsYearly) {
                CheckRow(stringResource(R.string.dates_field_with_year), d.withYear) { onChange(d.copy(withYear = it)) }
            }
            Text(stringResource(R.string.dates_field_reminder), style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                REMINDERS.forEach { n ->
                    FilterChip(
                        selected = d.remindDaysBefore == n,
                        onClick = { onChange(d.copy(remindDaysBefore = n)) },
                        label = { Text(remindText(n)) },
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (d.id != null) {
                    TextButton(onClick = onDelete, enabled = !saving, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(stringResource(R.string.dates_delete), color = MaterialTheme.colorScheme.error)
                    }
                }
                Spacer(Modifier.weight(1f))
                Button(onClick = onSave, enabled = d.title.isNotBlank() && !saving, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(if (d.id == null) R.string.dates_add else R.string.dates_save))
                }
            }
        }
    }

    if (picking) {
        val picker = rememberDatePickerState(
            initialSelectedDateMillis = d.date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    picker.selectedDateMillis?.let { ms ->
                        onChange(d.copy(date = java.time.Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()))
                    }
                    picking = false
                }) { Text(stringResource(android.R.string.ok)) }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text(stringResource(android.R.string.cancel)) } },
        ) { DatePicker(state = picker) }
    }
}

@Composable
private fun CheckRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { onChange(!checked) },
    ) {
        Checkbox(checked = checked, onCheckedChange = onChange)
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}

/** Aujourd'hui : les dates des deux semaines à venir (rien s'il n'y en a pas, ou hors ligne). */
@Composable
fun UpcomingDates(remote: DatesRemote, refreshKey: Any?, onOpen: () -> Unit) {
    var items by remember { mutableStateOf<List<ImportantDateDto>>(emptyList()) }
    LaunchedEffect(refreshKey) { (remote.list() ?: remote.cached())?.let { items = it } }
    LaunchedEffect(Unit) { remote.updates.collect { remote.list()?.let { items = it } } }
    val soon = items.filter { (it.daysLeft ?: Int.MAX_VALUE) <= 14 }.take(3)
    if (soon.isEmpty()) return
    SectionHeader(stringResource(R.string.dates_soon))
    OutlinedCard(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            soon.forEach { d ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    DateKindIcon(d.kind)
                    Text(d.title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                    Text(
                        whenText(d.daysLeft ?: 0),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
