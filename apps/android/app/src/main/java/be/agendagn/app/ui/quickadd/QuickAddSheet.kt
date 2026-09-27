package be.agendagn.app.ui.quickadd

import androidx.compose.ui.res.painterResource
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.pluralStringResource
import be.agendagn.app.domain.Agenda
import be.agendagn.app.domain.model.TaskTemplate
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import be.agendagn.app.R
import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.QuickAddPreview
import be.agendagn.app.ui.components.currentLocale
import be.agendagn.app.ui.components.formatMinute
import be.agendagn.app.ui.components.formatShortDate
import be.agendagn.app.ui.components.liveRegionPolite
import be.agendagn.app.ui.main.QuickAddState
import java.time.LocalDate

/** « Sortir les poubelles mardi 20h Nicolas » → aperçu analysé par l'API, puis ajout (hors ligne compris). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickAddSheet(
    state: QuickAddState,
    online: Boolean,
    members: Map<String, Member>,
    today: LocalDate,
    onText: (String) -> Unit,
    onSubmit: () -> Unit,
    onFullForm: () -> Unit,
    onDismiss: () -> Unit,
    /** Modèles du foyer (null = pas encore chargés ou hors ligne). */
    templates: List<TaskTemplate>? = null,
    onApplyTemplate: (TaskTemplate, LocalDate?) -> Unit = { _, _ -> },
    /** Dicter la tâche (reconnaissance vocale d'Android). */
    onVoice: (() -> Unit)? = null,
) {
    val focus = remember { FocusRequester() }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().imePadding().padding(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.quick_add), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = state.text,
                onValueChange = onText,
                placeholder = { Text(stringResource(R.string.quick_add_hint)) },
                supportingText = {
                    Text(stringResource(if (online) R.string.quick_add_help else R.string.quick_add_offline))
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onSubmit() }),
                trailingIcon = onVoice?.let {
                    {
                        IconButton(onClick = it) {
                            Icon(painterResource(R.drawable.ic_mic), contentDescription = stringResource(R.string.voice_dictate))
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
            )
            state.preview?.let { PreviewLine(it, members, today) }
            if (!templates.isNullOrEmpty()) TemplatePicker(templates, today, onApplyTemplate)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onFullForm, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.full_form))
                }
                Button(
                    onClick = onSubmit,
                    enabled = state.text.isNotBlank(),
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.add)) }
            }
        }
    }
    LaunchedEffect(Unit) { focus.requestFocus() }
}

@Composable
private fun PreviewLine(p: QuickAddPreview, members: Map<String, Member>, today: LocalDate) {
    val locale = currentLocale()
    val parts = listOfNotNull(
        p.title.ifBlank { null },
        p.date?.let { formatShortDate(it, locale, today) },
        p.startMinute?.let(::formatMinute),
        p.assigneeIds.mapNotNull { members[it]?.displayName }.takeIf { it.isNotEmpty() }?.joinToString(" & "),
    )
    Text(
        "→ " + parts.joinToString(" · "),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.semantics { liveRegionPolite() },
    )
}

/** « Ménage du samedi » → choisir le jour → toutes ses tâches créées d'un coup. */
@Composable
private fun TemplatePicker(templates: List<TaskTemplate>, today: LocalDate, onApply: (TaskTemplate, LocalDate?) -> Unit) {
    var chosen by remember { mutableStateOf<TaskTemplate?>(null) }
    val weekend = if (today.dayOfWeek.value >= 6) today else Agenda.postponeWeekend(today)
    val days = listOf(
        today to R.string.today,
        today.plusDays(1) to R.string.postpone_tomorrow,
        weekend to R.string.postpone_weekend,
        null to R.string.no_date,
    ).distinctBy { it.first }
    var day by remember { mutableStateOf<LocalDate?>(today) }
    Text(stringResource(R.string.templates_title), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        templates.forEach { t ->
            FilterChip(selected = chosen?.id == t.id, onClick = { chosen = if (chosen?.id == t.id) null else t }, label = { Text(t.label) })
        }
    }
    chosen?.let { t ->
        Text(t.titles.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            days.forEach { (d, label) ->
                FilterChip(selected = day == d, onClick = { day = d }, label = { Text(stringResource(label)) })
            }
        }
        OutlinedButton(onClick = { onApply(t, day) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text(pluralStringResource(R.plurals.templates_create, t.titles.size, t.titles.size))
        }
    }
}
