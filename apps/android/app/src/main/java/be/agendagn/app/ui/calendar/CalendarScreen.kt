package be.agendagn.app.ui.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import be.agendagn.app.R
import be.agendagn.app.domain.Agenda
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.ui.components.EmptyState
import be.agendagn.app.ui.components.SectionHeader
import be.agendagn.app.ui.components.TaskRow
import be.agendagn.app.ui.components.currentLocale
import be.agendagn.app.ui.components.formatLongDate
import be.agendagn.app.ui.main.AgendaUiState
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle

/** Mois (pastilles = tâches à faire) + liste du jour choisi. */
@Composable
fun CalendarScreen(
    state: AgendaUiState,
    month: YearMonth,
    selected: LocalDate,
    onMonth: (YearMonth) -> Unit,
    onSelect: (LocalDate) -> Unit,
    onToggle: (Occurrence) -> Unit,
    onOpen: (Occurrence) -> Unit,
    onAddOn: (LocalDate) -> Unit,
    contentPadding: PaddingValues = PaddingValues(),
) {
    val locale = currentLocale()
    val counts = Agenda.countsByDay(state.occurrences)
    val dayList = Agenda.onDay(state.occurrences, selected)
    LazyColumn(
        Modifier.fillMaxSize().padding(contentPadding),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 96.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { onMonth(month.minusMonths(1)) }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = stringResource(R.string.previous_month))
                }
                Text(
                    DateTimeFormatter.ofPattern("LLLL yyyy", locale).format(month).replaceFirstChar { it.titlecase(locale) },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                IconButton(onClick = { onMonth(month.plusMonths(1)) }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = stringResource(R.string.next_month))
                }
            }
            MonthGrid(month, selected, state.today, counts, onSelect)
        }
        item {
            SectionHeader(if (selected == state.today) stringResource(R.string.today) else formatLongDate(selected, locale))
        }
        if (dayList.isEmpty()) item { EmptyState(stringResource(R.string.day_empty)) }
        items(dayList, key = { it.id }) { TaskRow(it, state.members, { onToggle(it) }, { onOpen(it) }) }
        item {
            TextButton(onClick = { onAddOn(selected) }, modifier = Modifier.heightIn(min = 48.dp)) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text(stringResource(R.string.add_on_day), modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
private fun MonthGrid(
    month: YearMonth,
    selected: LocalDate,
    today: LocalDate,
    counts: Map<LocalDate, Int>,
    onSelect: (LocalDate) -> Unit,
) {
    val locale = currentLocale()
    // Semaine du lundi au dimanche (usage belge / français).
    val first = month.atDay(1)
    val offset = first.dayOfWeek.value - 1
    val days = (0 until 42).map { first.minusDays(offset.toLong()).plusDays(it.toLong()) }
        .chunked(7).filter { week -> week.any { YearMonth.from(it) == month } }
    Column {
        Row(Modifier.fillMaxWidth().clearAndSetSemantics { }) {
            DayOfWeek.entries.forEach {
                Text(
                    it.getDisplayName(TextStyle.NARROW, locale),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f).padding(vertical = 6.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
        days.forEach { week ->
            Row(Modifier.fillMaxWidth()) {
                week.forEach { day ->
                    DayCell(
                        day = day,
                        inMonth = YearMonth.from(day) == month,
                        isToday = day == today,
                        isSelected = day == selected,
                        count = counts[day] ?: 0,
                        onClick = { onSelect(day) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun DayCell(
    day: LocalDate,
    inMonth: Boolean,
    isToday: Boolean,
    isSelected: Boolean,
    count: Int,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    val locale = currentLocale()
    val description = pluralStringResource(R.plurals.day_tasks, count, count, formatLongDate(day, locale))
    val colors = MaterialTheme.colorScheme
    Box(
        modifier.aspectRatio(1f).heightIn(min = 48.dp).padding(2.dp)
            .background(if (isSelected) colors.primary else Color.Transparent, MaterialTheme.shapes.medium)
            .then(if (isToday && !isSelected) Modifier.border(1.5.dp, colors.primary, MaterialTheme.shapes.medium) else Modifier)
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = description
                role = Role.Button
                this.selected = isSelected
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                day.dayOfMonth.toString(),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                color = when {
                    isSelected -> colors.onPrimary
                    inMonth -> colors.onSurface
                    else -> colors.onSurfaceVariant.copy(alpha = 0.6f)
                },
            )
            // Hauteur fixe : les chiffres restent alignés, avec ou sans pastille.
            Row(Modifier.height(5.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                repeat(minOf(count, 3)) {
                    Box(Modifier.size(5.dp).background(if (isSelected) colors.onPrimary else colors.primary, CircleShape))
                }
            }
        }
    }
}
