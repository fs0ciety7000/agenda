package be.agendagn.app.ui.taskform

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import be.agendagn.app.domain.Agenda
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import be.agendagn.app.R
import be.agendagn.app.domain.model.Category
import be.agendagn.app.domain.model.EditScope
import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.Priority
import be.agendagn.app.domain.model.Repeat
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.ui.components.MemberAvatar
import be.agendagn.app.ui.components.currentLocale
import be.agendagn.app.ui.components.formatDuration
import be.agendagn.app.ui.components.formatLongDate
import be.agendagn.app.ui.components.formatMinute
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskFormScreen(
    state: TaskFormState,
    members: List<Member>,
    categories: List<Category>,
    calendarAvailable: Boolean,
    onEdit: ((TaskDraft) -> TaskDraft) -> Unit,
    onSave: () -> Unit,
    onDelete: () -> Unit,
    onConfirmDelete: () -> Unit,
    onScope: (EditScope) -> Unit,
    onDismissDialogs: () -> Unit,
    onBack: () -> Unit,
    /** Personne la moins chargée de la semaine de la tâche (proposée si personne n'est choisi). */
    suggestion: Pair<Member, Agenda.Share>? = null,
) {
    LaunchedEffect(state.done) { if (state.done) onBack() }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                title = { Text(stringResource(if (state.isEdit) R.string.edit_task else R.string.new_task)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
                    }
                },
                actions = {
                    if (state.isEdit && !state.readOnly) {
                        IconButton(onClick = onDelete) {
                            Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.delete))
                        }
                    }
                },
            )
        },
    ) { padding ->
        if (state.loading) return@Scaffold
        val d = state.draft
        Column(
            Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (state.readOnly) Hint(stringResource(R.string.local_not_editable))
            OutlinedTextField(
                value = d.title,
                onValueChange = { v -> onEdit { it.copy(title = v) } },
                label = { Text(stringResource(R.string.field_title)) },
                isError = state.error == FormError.TITLE_REQUIRED,
                supportingText = if (state.error == FormError.TITLE_REQUIRED) {
                    { Text(stringResource(R.string.error_title_required)) }
                } else null,
                singleLine = true,
                enabled = !state.readOnly,
                modifier = Modifier.fillMaxWidth(),
            )
            DateTimeFields(d, onEdit, enabled = !state.readOnly)

            Label(stringResource(R.string.field_who))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                members.forEach { m ->
                    FilterChip(
                        selected = m.id in d.assigneeIds,
                        enabled = !d.personal && !state.readOnly,
                        onClick = {
                            onEdit {
                                it.copy(assigneeIds = if (m.id in it.assigneeIds) it.assigneeIds - m.id else it.assigneeIds + m.id)
                            }
                        },
                        label = { Text(m.displayName) },
                        leadingIcon = { MemberAvatar(m, 20) },
                    )
                }
            }
            if (suggestion != null && d.assigneeIds.isEmpty() && !d.personal && !state.readOnly) {
                val (member, share) = suggestion
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Hint(
                        pluralStringResource(R.plurals.assignee_suggestion, share.count, member.displayName, share.count),
                        Modifier.weight(1f),
                    )
                    TextButton(onClick = { onEdit { it.copy(assigneeIds = listOf(member.id)) } }) {
                        Text(stringResource(R.string.assignee_suggestion_pick, member.displayName))
                    }
                }
            }

            if (!state.isEdit) {
                Label(stringResource(R.string.field_repeat))
                ChipRow(
                    listOf(
                        Repeat.NONE to R.string.repeat_none, Repeat.DAILY to R.string.repeat_daily,
                        Repeat.WEEKLY to R.string.repeat_weekly, Repeat.BIWEEKLY to R.string.repeat_biweekly,
                        Repeat.MONTHLY to R.string.repeat_monthly,
                    ).map { (v, res) -> v to stringResource(res) },
                    d.repeat,
                ) { r -> onEdit { it.copy(repeat = r) } }
                if (d.repeat != Repeat.NONE && d.assigneeIds.size >= 2 && !d.personal) {
                    CheckRow(stringResource(R.string.field_alternate), d.alternate) { v -> onEdit { it.copy(alternate = v) } }
                }
                if (d.repeat != Repeat.NONE) Hint(stringResource(R.string.repeat_web_hint))
            }

            if (categories.isNotEmpty()) {
                Label(stringResource(R.string.field_category))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = d.categoryId == null,
                        enabled = !state.readOnly,
                        onClick = { onEdit { it.copy(categoryId = null) } },
                        label = { Text(stringResource(R.string.none)) },
                    )
                    categories.forEach { c ->
                        FilterChip(
                            selected = d.categoryId == c.id,
                            enabled = !state.readOnly,
                            onClick = { onEdit { it.copy(categoryId = c.id) } },
                            label = { Text(listOfNotNull(c.emoji, c.name).joinToString(" ")) },
                        )
                    }
                }
            }

            Label(stringResource(R.string.field_priority))
            ChipRow(
                listOf(
                    Priority.LOW to R.string.priority_low, Priority.NORMAL to R.string.priority_normal,
                    Priority.HIGH to R.string.priority_high, Priority.URGENT to R.string.priority_urgent,
                ).map { (v, res) -> v to stringResource(res) },
                d.priority,
                enabled = !state.readOnly,
            ) { p -> onEdit { it.copy(priority = p) } }

            OutlinedTextField(
                value = d.notes,
                onValueChange = { v -> onEdit { it.copy(notes = v) } },
                label = { Text(stringResource(R.string.field_notes)) },
                minLines = 2,
                enabled = !state.readOnly,
                modifier = Modifier.fillMaxWidth(),
            )

            SwitchRow(stringResource(R.string.field_personal), d.personal, enabled = !state.readOnly) { v ->
                onEdit { it.copy(personal = v, syncToCalendar = if (v) false else it.syncToCalendar) }
            }
            if (calendarAvailable && !d.personal) {
                CheckRow(
                    stringResource(R.string.field_sync),
                    d.syncToCalendar && d.date != null,
                    enabled = d.date != null && !state.readOnly,
                ) { v -> onEdit { it.copy(syncToCalendar = v) } }
                if (d.date == null) Hint(stringResource(R.string.field_sync_needs_date))
            }

            state.error?.takeIf { it != FormError.TITLE_REQUIRED }?.let { e ->
                Text(
                    stringResource(
                        when (e) {
                            FormError.OFFLINE -> R.string.error_offline_edit
                            FormError.CONFLICT -> R.string.error_conflict
                            FormError.NOT_FOUND -> R.string.error_not_found
                            else -> R.string.error_generic
                        },
                    ),
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            Button(
                onClick = onSave,
                enabled = !state.saving && !state.readOnly,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                if (state.saving) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.heightIn(max = 18.dp))
                else Text(stringResource(R.string.save))
            }
        }
    }

    if (state.confirmDelete) {
        AlertDialog(
            onDismissRequest = onDismissDialogs,
            text = { Text(stringResource(R.string.delete_confirm, state.draft.title)) },
            confirmButton = { TextButton(onClick = onConfirmDelete) { Text(stringResource(R.string.delete)) } },
            dismissButton = { TextButton(onClick = onDismissDialogs) { Text(stringResource(R.string.cancel)) } },
        )
    }
    state.askScopeFor?.let {
        AlertDialog(
            onDismissRequest = onDismissDialogs,
            title = { Text(stringResource(R.string.scope_title)) },
            text = {
                Column {
                    listOf(
                        EditScope.THIS to R.string.scope_this,
                        EditScope.FOLLOWING to R.string.scope_following,
                        EditScope.ALL to R.string.scope_all,
                    ).forEach { (scope, label) ->
                        TextButton(onClick = { onScope(scope) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                            Text(stringResource(label), modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = onDismissDialogs) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateTimeFields(d: TaskDraft, onEdit: ((TaskDraft) -> TaskDraft) -> Unit, enabled: Boolean) {
    val locale = currentLocale()
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedButton(onClick = { pickDate = true }, enabled = enabled, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
            Text(d.date?.let { formatLongDate(it, locale) } ?: stringResource(R.string.field_date))
        }
        if (d.date != null) {
            OutlinedButton(onClick = { pickTime = true }, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(d.startMinute?.let(::formatMinute) ?: stringResource(R.string.no_time))
            }
        }
    }
    if (d.date != null && d.startMinute != null) {
        Label(stringResource(R.string.field_duration))
        ChipRow(listOf(15, 30, 45, 60, 90, 120).map { it to formatDuration(it) }, d.durationMinutes ?: 30, enabled = enabled) { m ->
            onEdit { it.copy(durationMinutes = m) }
        }
    }
    if (pickDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = (d.date ?: LocalDate.now()).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    val date = state.selectedDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    onEdit { it.copy(date = date) }
                    pickDate = false
                }) { Text(stringResource(R.string.ok)) }
            },
            dismissButton = {
                TextButton(onClick = {
                    onEdit { it.copy(date = null, startMinute = null, durationMinutes = null, repeat = Repeat.NONE) }
                    pickDate = false
                }) { Text(stringResource(R.string.clear)) }
            },
        ) { DatePicker(state) }
    }
    if (pickTime) {
        val state = rememberTimePickerState(
            initialHour = (d.startMinute ?: 540) / 60,
            initialMinute = (d.startMinute ?: 540) % 60,
            is24Hour = true,
        )
        AlertDialog(
            onDismissRequest = { pickTime = false },
            text = { TimePicker(state) },
            confirmButton = {
                TextButton(onClick = {
                    onEdit { it.copy(startMinute = state.hour * 60 + state.minute, durationMinutes = it.durationMinutes ?: 30) }
                    pickTime = false
                }) { Text(stringResource(R.string.ok)) }
            },
            dismissButton = {
                TextButton(onClick = {
                    onEdit { it.copy(startMinute = null, durationMinutes = null) }
                    pickTime = false
                }) { Text(stringResource(R.string.no_time)) }
            },
        )
    }
}

@Composable
private fun Label(text: String) =
    Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
private fun Hint(text: String, modifier: Modifier = Modifier) =
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)

@Composable
private fun <T> ChipRow(
    options: List<Pair<T, String>>,
    selected: T,
    enabled: Boolean = true,
    onSelect: (T) -> Unit,
) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (value, label) ->
            FilterChip(
                selected = value == selected,
                enabled = enabled,
                onClick = { onSelect(value) },
                label = { Text(label) },
            )
        }
    }
}

@Composable
private fun CheckRow(label: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .toggleable(value = checked, enabled = enabled, role = Role.Checkbox, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = checked, onCheckedChange = null, enabled = enabled)
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 12.dp))
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}
