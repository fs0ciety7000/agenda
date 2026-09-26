package be.agendagn.app.ui.calendar

import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.unit.IntOffset
import kotlin.math.roundToInt
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

/** Tâche en cours de glissement : position du doigt (coordonnées racine) et jour survolé. */
private data class Drag(val occurrence: Occurrence, val pointer: Offset, val target: LocalDate?)

/**
 * Mois (pastilles = tâches à faire) + liste du jour choisi.
 * Glisser-déposer : appui long sur une tâche de la liste, puis la lâcher sur un jour du mois
 * (l'heure est conservée). Alternative TalkBack : actions « jour précédent / suivant ».
 */
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
    onMove: (Occurrence, LocalDate) -> Unit = { _, _ -> },
    contentPadding: PaddingValues = PaddingValues(),
) {
    val locale = currentLocale()
    val counts = Agenda.countsByDay(state.occurrences)
    val dayList = Agenda.onDay(state.occurrences, selected)
    val haptics = LocalHapticFeedback.current
    val cells = remember { mutableMapOf<LocalDate, Rect>() }
    var drag by remember { mutableStateOf<Drag?>(null) }
    var origin by remember { mutableStateOf(Offset.Zero) }
    val dayAt = { p: Offset -> cells.entries.firstOrNull { it.value.contains(p) }?.key }
    val prevLabel = stringResource(R.string.move_previous_day)
    val nextLabel = stringResource(R.string.move_next_day)
    Box(Modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInRoot() }) {
    LazyColumn(
        Modifier.fillMaxSize().padding(contentPadding),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 96.dp),
        userScrollEnabled = drag == null,
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
            MonthGrid(
                month, selected, state.today, counts, onSelect,
                dropTarget = drag?.target,
                onCellBounds = { day, rect -> cells[day] = rect },
            )
        }
        item {
            SectionHeader(if (selected == state.today) stringResource(R.string.today) else formatLongDate(selected, locale))
        }
        if (dayList.isEmpty()) item { EmptyState(stringResource(R.string.day_empty)) }
        else item {
            Text(
                stringResource(R.string.drag_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
            )
        }
        items(dayList, key = { it.id }) { o ->
            val movable = !o.isLocal && o.date != null
            var rowOrigin by remember { mutableStateOf(Offset.Zero) }
            Box(
                Modifier
                    .onGloballyPositioned { rowOrigin = it.positionInRoot() }
                    .alpha(if (drag?.occurrence?.id == o.id) 0.4f else 1f)
                    .then(
                        if (!movable) Modifier
                        else Modifier
                            .pointerInput(o.id, o.date) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { at ->
                                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                        val p = rowOrigin + at
                                        drag = Drag(o, p, dayAt(p))
                                    },
                                    onDrag = { change, amount ->
                                        change.consume()
                                        drag = drag?.let { d ->
                                            val p = d.pointer + amount
                                            val target = dayAt(p)
                                            if (target != null && target != d.target) {
                                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                            }
                                            d.copy(pointer = p, target = target)
                                        }
                                    },
                                    onDragEnd = {
                                        drag?.let { d -> d.target?.let { if (it != o.date) onMove(o, it) } }
                                        drag = null
                                    },
                                    onDragCancel = { drag = null },
                                )
                            }
                            .semantics {
                                customActions = listOf(
                                    CustomAccessibilityAction(prevLabel) { onMove(o, o.date!!.minusDays(1)); true },
                                    CustomAccessibilityAction(nextLabel) { onMove(o, o.date!!.plusDays(1)); true },
                                )
                            },
                    ),
            ) {
                TaskRow(o, state.members, { onToggle(o) }, { onOpen(o) })
            }
        }
        item {
            TextButton(onClick = { onAddOn(selected) }, modifier = Modifier.heightIn(min = 48.dp)) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text(stringResource(R.string.add_on_day), modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
    // Étiquette qui suit le doigt pendant le glissement.
    drag?.let { d ->
        val density = LocalDensity.current
        Surface(
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.primaryContainer,
            shadowElevation = 6.dp,
            modifier = Modifier
                .offset {
                    val p = d.pointer - origin
                    IntOffset((p.x - with(density) { 24.dp.toPx() }).roundToInt(), (p.y - with(density) { 56.dp.toPx() }).roundToInt())
                }
                .widthIn(max = 240.dp)
                .clearAndSetSemantics { },
        ) {
            Text(
                listOfNotNull(d.occurrence.title, d.target?.let { formatLongDate(it, locale) }).joinToString(" → "),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                maxLines = 2,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            )
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
    dropTarget: LocalDate? = null,
    onCellBounds: (LocalDate, Rect) -> Unit = { _, _ -> },
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
                        isDropTarget = day == dropTarget,
                        modifier = Modifier.weight(1f).onGloballyPositioned { onCellBounds(day, it.boundsInRoot()) },
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
    isDropTarget: Boolean,
    modifier: Modifier,
) {
    val locale = currentLocale()
    val description = pluralStringResource(R.plurals.day_tasks, count, count, formatLongDate(day, locale))
    val colors = MaterialTheme.colorScheme
    Box(
        modifier.aspectRatio(1f).heightIn(min = 48.dp).padding(2.dp)
            .background(if (isSelected) colors.primary else Color.Transparent, MaterialTheme.shapes.medium)
            .then(
                when {
                    isDropTarget -> Modifier.background(colors.primaryContainer, MaterialTheme.shapes.medium)
                        .border(2.dp, colors.primary, MaterialTheme.shapes.medium)
                    isToday && !isSelected -> Modifier.border(1.5.dp, colors.primary, MaterialTheme.shapes.medium)
                    else -> Modifier
                },
            )
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
