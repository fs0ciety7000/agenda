package app.tandem.foyer.ui.calendar

import app.tandem.foyer.ui.components.memberColor
import app.tandem.foyer.ui.components.PillChip
import app.tandem.foyer.domain.model.Member
import androidx.compose.runtime.saveable.rememberSaveable
import app.tandem.foyer.ui.theme.Tokens
import app.tandem.foyer.ui.components.flatRow
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
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
import app.tandem.foyer.R
import app.tandem.foyer.domain.Agenda
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.ui.components.EmptyState
import app.tandem.foyer.ui.components.SectionHeader
import app.tandem.foyer.ui.components.TaskRow
import app.tandem.foyer.ui.components.currentLocale
import app.tandem.foyer.ui.components.formatLongDate
import app.tandem.foyer.ui.main.AgendaUiState
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
    // Mois (grille) ou Semaine (bandeau de 7 jours, plus de place pour la liste du jour).
    var weekMode by rememberSaveable { mutableStateOf(false) }
    val prevLabel = stringResource(R.string.move_previous_day)
    val nextLabel = stringResource(R.string.move_next_day)
    Box(Modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInRoot() }) {
    LazyColumn(
        Modifier.fillMaxSize().padding(contentPadding),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 24.dp),
        userScrollEnabled = drag == null,
    ) {
        item {
            // Titre du mois en grand (refonte « Duo »), flèches à droite.
            Row(Modifier.padding(start = 4.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    DateTimeFormatter.ofPattern("LLLL yyyy", locale).format(month).replaceFirstChar { it.titlecase(locale) },
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                IconButton(onClick = {
                    if (weekMode) selected.minusWeeks(1).let { onSelect(it); onMonth(YearMonth.from(it)) }
                    else onMonth(month.minusMonths(1))
                }) {
                    Icon(
                        Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                        contentDescription = stringResource(if (weekMode) R.string.previous_week else R.string.previous_month),
                    )
                }
                IconButton(onClick = {
                    if (weekMode) selected.plusWeeks(1).let { onSelect(it); onMonth(YearMonth.from(it)) }
                    else onMonth(month.plusMonths(1))
                }) {
                    Icon(
                        Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = stringResource(if (weekMode) R.string.next_week else R.string.next_month),
                    )
                }
            }
            Row(Modifier.padding(start = 4.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PillChip(stringResource(R.string.calendar_view_month), !weekMode, {
                    weekMode = false
                    cells.clear()
                })
                PillChip(stringResource(R.string.calendar_view_week), weekMode, {
                    weekMode = true
                    cells.clear()
                })
            }
            if (weekMode) {
                WeekStrip(
                    days = Agenda.weekOf(selected),
                    selected = selected,
                    today = state.today,
                    occurrences = state.occurrences,
                    members = state.household?.members.orEmpty(),
                    onSelect = { onSelect(it); onMonth(YearMonth.from(it)) },
                    dropTarget = drag?.target,
                    onCellBounds = { day, rect -> cells[day] = rect },
                )
            } else {
                MonthGrid(
                    month, selected, state.today, counts, onSelect,
                    dropTarget = drag?.target,
                    onCellBounds = { day, rect -> cells[day] = rect },
                )
            }
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
                TaskRow(o, state.members, { onToggle(o) }, { onOpen(o) }, modifier = Modifier.flatRow(dayList.indexOf(o)))
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
    // Choisi : couleur d'action ; aujourd'hui : fond gris (comme le bandeau de semaine du site).
    val shape = RoundedCornerShape(Tokens.Radius.md)
    Box(
        modifier.aspectRatio(1f).heightIn(min = 48.dp).padding(2.dp)
            .background(
                when {
                    isSelected -> colors.primary
                    isToday -> colors.surfaceVariant
                    else -> Color.Transparent
                },
                shape,
            )
            .then(
                if (isDropTarget) Modifier.background(colors.primaryContainer, shape).border(2.dp, colors.primary, shape)
                else Modifier,
            )
            .clip(shape)
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
                fontWeight = if (isToday || isSelected) FontWeight.SemiBold else FontWeight.Normal,
                color = when {
                    isSelected -> colors.onPrimary
                    inMonth -> colors.onSurface
                    else -> colors.onSurfaceVariant.copy(alpha = 0.6f)
                },
            )
            // Hauteur fixe : les chiffres restent alignés, avec ou sans pastille.
            Row(Modifier.height(5.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                repeat(minOf(count, 3)) {
                    Box(Modifier.size(5.dp).background(if (isSelected) colors.onPrimary else colors.onSurfaceVariant, CircleShape))
                }
            }
        }
    }
}

/**
 * Bandeau de la semaine (refonte « Duo ») : un bouton par jour, le jour choisi en couleur d'action,
 * aujourd'hui sur fond gris, une pastille par personne qui a quelque chose ce jour-là. Chaque jour
 * reçoit aussi les tâches glissées depuis la liste.
 */
@Composable
private fun WeekStrip(
    days: List<LocalDate>,
    selected: LocalDate,
    today: LocalDate,
    occurrences: List<Occurrence>,
    members: List<Member>,
    onSelect: (LocalDate) -> Unit,
    dropTarget: LocalDate?,
    onCellBounds: (LocalDate, Rect) -> Unit,
) {
    val locale = currentLocale()
    val colors = MaterialTheme.colorScheme
    val counts = Agenda.countsByDay(occurrences)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        days.forEach { day ->
            val isSelected = day == selected
            val who = Agenda.whoOnDay(occurrences, day)
            val count = counts[day] ?: 0
            val description = pluralStringResource(R.plurals.day_tasks, count, count, formatLongDate(day, locale))
            val shape = RoundedCornerShape(22.dp)
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = 76.dp)
                    .onGloballyPositioned { onCellBounds(day, it.boundsInRoot()) }
                    .clip(shape)
                    .background(
                        when {
                            day == dropTarget -> colors.primaryContainer
                            isSelected -> colors.primary
                            day == today -> colors.surfaceVariant
                            else -> Color.Transparent
                        },
                        shape,
                    )
                    .clickable { onSelect(day) }
                    .semantics {
                        contentDescription = description
                        role = Role.Button
                        this.selected = isSelected
                    }
                    .padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val fg = if (isSelected) colors.onPrimary else colors.onSurface
                Text(
                    day.dayOfWeek.getDisplayName(TextStyle.SHORT, locale).replaceFirstChar { it.titlecase(locale) },
                    style = MaterialTheme.typography.labelMedium,
                    color = fg.copy(alpha = 0.75f),
                )
                Text(day.dayOfMonth.toString(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = fg)
                // Pastilles de membres (couleur + nom dans la liste du jour : jamais la couleur seule).
                Row(Modifier.height(6.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    members.filter { it.id in who }.take(3).forEach { m ->
                        Box(Modifier.size(6.dp).background(memberColor(m.color), CircleShape))
                    }
                }
            }
        }
    }
}
