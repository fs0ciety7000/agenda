package be.agendagn.app.ui.quickadd

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
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
            )
            state.preview?.let { PreviewLine(it, members, today) }
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
