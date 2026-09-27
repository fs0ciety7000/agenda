package be.agendagn.app.ui.taskform

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import be.agendagn.app.R
import be.agendagn.app.domain.PreviewItem
import be.agendagn.app.domain.RecurrenceSpec
import be.agendagn.app.domain.Recurrences
import be.agendagn.app.domain.RepeatEnd
import be.agendagn.app.domain.RepeatPreset
import be.agendagn.app.domain.RepeatUnit
import be.agendagn.app.domain.RotationKind
import be.agendagn.app.domain.model.Member
import be.agendagn.app.ui.components.currentLocale
import be.agendagn.app.ui.components.formatLongDate
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.TextStyle

/**
 * Répétition + rotation (même choix que le web) : les valeurs par défaut couvrent la plupart des cas
 * (« Chaque semaine », responsables choisis au-dessus) ; les réglages avancés n'apparaissent qu'à la demande.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RecurrenceSection(
    spec: RecurrenceSpec,
    date: LocalDate?,
    members: List<Member>,
    personal: Boolean,
    /** Série existante : « Ne pas répéter » n'est pas proposé (supprimer la série à la place). */
    allowNone: Boolean,
    preview: List<PreviewItem>?,
    onChange: (RecurrenceSpec) -> Unit,
) {
    val locale = currentLocale()
    val start = date ?: LocalDate.now()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Label(stringResource(R.string.field_repeat))
        WrapChips(
            listOf(
                RepeatPreset.NONE to R.string.repeat_none, RepeatPreset.DAILY to R.string.repeat_daily,
                RepeatPreset.WEEKDAYS to R.string.repeat_weekdays, RepeatPreset.WEEKLY to R.string.repeat_weekly,
                RepeatPreset.BIWEEKLY to R.string.repeat_biweekly, RepeatPreset.MONTHLY to R.string.repeat_monthly,
                RepeatPreset.QUARTERLY to R.string.repeat_quarterly, RepeatPreset.YEARLY to R.string.repeat_yearly,
                RepeatPreset.AFTER to R.string.repeat_after, RepeatPreset.CUSTOM to R.string.repeat_custom,
            ).filter { allowNone || it.first != RepeatPreset.NONE }.map { (v, res) -> v to stringResource(res) },
            spec.preset,
        ) { preset ->
            // « Après la dernière fois » : jours, semaines ou mois ; pas de nombre de fois.
            onChange(
                if (preset == RepeatPreset.AFTER) {
                    spec.copy(
                        preset = preset,
                        unit = if (spec.unit == RepeatUnit.YEAR) RepeatUnit.MONTH else spec.unit,
                        end = if (spec.end == RepeatEnd.COUNT) RepeatEnd.NEVER else spec.end,
                    )
                } else spec.copy(preset = preset),
            )
        }

        if (spec.after) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.repeat_every), style = MaterialTheme.typography.bodyLarge)
                Stepper(spec.interval, 1, 365, stringResource(R.string.repeat_interval)) { onChange(spec.copy(interval = it)) }
            }
            WrapChips(
                listOf(
                    RepeatUnit.DAY to pluralStringResource(R.plurals.repeat_unit_day, spec.interval),
                    RepeatUnit.WEEK to pluralStringResource(R.plurals.repeat_unit_week, spec.interval),
                    RepeatUnit.MONTH to stringResource(R.string.repeat_unit_month),
                ),
                spec.unit,
            ) { onChange(spec.copy(unit = it)) }
            Hint(stringResource(R.string.repeat_after_hint))
        }

        if (spec.preset == RepeatPreset.CUSTOM) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.repeat_every), style = MaterialTheme.typography.bodyLarge)
                Stepper(spec.interval, 1, 365, stringResource(R.string.repeat_interval)) { onChange(spec.copy(interval = it)) }
            }
            WrapChips(
                listOf(
                    RepeatUnit.DAY to pluralStringResource(R.plurals.repeat_unit_day, spec.interval),
                    RepeatUnit.WEEK to pluralStringResource(R.plurals.repeat_unit_week, spec.interval),
                    RepeatUnit.MONTH to stringResource(R.string.repeat_unit_month),
                    RepeatUnit.YEAR to pluralStringResource(R.plurals.repeat_unit_year, spec.interval),
                ),
                spec.unit,
            ) { onChange(spec.copy(unit = it)) }
        }

        if (spec.showsWeekdays) {
            val selected = Recurrences.weekdays(spec, start).toSet()
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                DayOfWeek.entries.forEach { day ->
                    val on = day in selected
                    val name = day.getDisplayName(TextStyle.FULL, locale)
                    FilterChip(
                        selected = on,
                        onClick = {
                            val next = if (on) selected - day else selected + day
                            if (next.isNotEmpty()) onChange(spec.copy(weekdays = next))
                        },
                        label = { Text(day.getDisplayName(TextStyle.SHORT, locale)) },
                        modifier = Modifier.semantics { contentDescription = name },
                    )
                }
            }
        }

        if (spec.showsMonthDay) {
            WrapChips(
                listOf(
                    false to stringResource(R.string.repeat_on_day, start.dayOfMonth),
                    true to stringResource(R.string.repeat_last_day),
                ),
                spec.lastDayOfMonth,
            ) { onChange(spec.copy(lastDayOfMonth = it)) }
        }

        if (!spec.repeating) return@Column

        Label(stringResource(R.string.repeat_ends))
        WrapChips(
            listOfNotNull(
                RepeatEnd.NEVER to stringResource(R.string.repeat_end_never),
                RepeatEnd.UNTIL to stringResource(R.string.repeat_end_until),
                if (spec.after) null else RepeatEnd.COUNT to stringResource(R.string.repeat_end_count),
            ),
            spec.end,
        ) { end ->
            onChange(spec.copy(end = end, until = if (end == RepeatEnd.UNTIL) spec.until ?: start.plusMonths(3) else spec.until))
        }
        when (spec.end) {
            RepeatEnd.UNTIL -> UntilButton(spec.until ?: start.plusMonths(3), start) { onChange(spec.copy(until = it)) }
            RepeatEnd.COUNT -> Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.repeat_times), style = MaterialTheme.typography.bodyLarge)
                Stepper(spec.count, 1, 1000, stringResource(R.string.repeat_times)) { onChange(spec.copy(count = it)) }
            }
            RepeatEnd.NEVER -> Unit
        }

        if (!personal && members.size > 1) {
            RotationFields(spec, start, members, onChange)
        }

        if (date != null && preview != null && !spec.after) PreviewList(preview, members, personal)
    }
}

@Composable
private fun RotationFields(spec: RecurrenceSpec, start: LocalDate, members: List<Member>, onChange: (RecurrenceSpec) -> Unit) {
    val locale = currentLocale()
    val weekdayCount = Recurrences.ruleWeekdays(spec, start).size
    Label(stringResource(R.string.rotation_title))
    WrapChips(
        listOfNotNull(
            RotationKind.FIXED to stringResource(R.string.rotation_fixed),
            RotationKind.ALTERNATE to stringResource(R.string.rotation_alternate),
            RotationKind.SEQUENCE to stringResource(R.string.rotation_sequence),
            if (weekdayCount >= 2) RotationKind.WEEKDAY to stringResource(R.string.rotation_weekday) else null,
        ),
        spec.rotation,
    ) { onChange(spec.copy(rotation = it)) }

    val together = stringResource(if (members.size == 2) R.string.rotation_both else R.string.rotation_everyone)
    val memberOptions = members.map { it.id to it.displayName } + (RecurrenceSpec.TOGETHER to together)

    when (spec.rotation) {
        RotationKind.FIXED -> Hint(stringResource(R.string.rotation_fixed_hint))
        RotationKind.ALTERNATE -> {
            val order = Recurrences.order(spec, members)
            Label(stringResource(R.string.rotation_starts_with))
            WrapChips(members.map { it.id to it.displayName }, order.first()) { first ->
                onChange(spec.copy(order = listOf(first) + members.map { it.id }.filter { it != first }))
            }
        }
        RotationKind.SEQUENCE -> {
            val steps = Recurrences.sequence(spec, members)
            steps.forEachIndexed { i, step ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${i + 1}.", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.width(28.dp))
                    Row(Modifier.weight(1f)) {
                        ChipRow(memberOptions, step) { v -> onChange(spec.copy(sequence = steps.mapIndexed { j, s -> if (j == i) v else s })) }
                    }
                    val remove = stringResource(R.string.rotation_remove_step, i + 1)
                    IconButton(onClick = { onChange(spec.copy(sequence = steps.filterIndexed { j, _ -> j != i })) }, enabled = steps.size > 1) {
                        Icon(Icons.Filled.Close, contentDescription = remove)
                    }
                }
            }
            if (steps.size < 14) {
                TextButton(
                    onClick = { onChange(spec.copy(sequence = steps + members[steps.size % members.size].id)) },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.rotation_add_step)) }
            }
        }
        RotationKind.WEEKDAY -> {
            val options = memberOptions + (RecurrenceSpec.IN_TURN to stringResource(R.string.rotation_alternate))
            Recurrences.ruleWeekdays(spec, start).forEach { day ->
                Text(
                    day.getDisplayName(TextStyle.FULL, locale).replaceFirstChar { it.titlecase(locale) },
                    style = MaterialTheme.typography.bodyMedium,
                )
                WrapChips(options, spec.byDay[day] ?: RecurrenceSpec.IN_TURN) { v -> onChange(spec.copy(byDay = spec.byDay + (day to v))) }
            }
        }
    }
    if (spec.rotation != RotationKind.FIXED && !spec.after) {
        CheckRow(stringResource(R.string.rotation_per_week), spec.perWeek) { onChange(spec.copy(perWeek = it)) }
    }
}

@Composable
private fun PreviewList(items: List<PreviewItem>, members: List<Member>, personal: Boolean) {
    val locale = currentLocale()
    val names = members.associate { it.id to it.displayName }
    val unassigned = stringResource(R.string.unassigned)
    Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Label(stringResource(R.string.repeat_next))
        if (items.isEmpty()) {
            Text(stringResource(R.string.repeat_no_occurrence), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        items.forEach { item ->
            Row(Modifier.fillMaxWidth()) {
                Text(formatLongDate(item.date, locale), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                if (!personal) {
                    Text(
                        item.assigneeIds.mapNotNull(names::get).joinToString(" & ").ifEmpty { unassigned },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** Choix qui passent à la ligne : l'option retenue reste toujours visible. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun <T> WrapChips(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (value, label) ->
            FilterChip(selected = value == selected, onClick = { onSelect(value) }, label = { Text(label) })
        }
    }
}

@Composable
private fun Stepper(value: Int, min: Int, max: Int, label: String, onChange: (Int) -> Unit) {
    val less = stringResource(R.string.decrease, label)
    val more = stringResource(R.string.increase, label)
    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { onChange((value - 1).coerceAtLeast(min)) }, enabled = value > min, modifier = Modifier.semantics { contentDescription = less }) {
            Text("−", style = MaterialTheme.typography.titleLarge)
        }
        Text("$value", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 4.dp))
        TextButton(onClick = { onChange((value + 1).coerceAtMost(max)) }, enabled = value < max, modifier = Modifier.semantics { contentDescription = more }) {
            Text("+", style = MaterialTheme.typography.titleLarge)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UntilButton(until: LocalDate, start: LocalDate, onPick: (LocalDate) -> Unit) {
    val locale = currentLocale()
    var open by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { open = true }, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(stringResource(R.string.repeat_until, formatLongDate(until, locale)))
    }
    if (open) {
        val state = rememberDatePickerState(initialSelectedDateMillis = until.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis
                        ?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                        ?.let { onPick(maxOf(it, start)) }
                    open = false
                }) { Text(stringResource(R.string.ok)) }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text(stringResource(R.string.cancel)) } },
        ) { DatePicker(state) }
    }
}
