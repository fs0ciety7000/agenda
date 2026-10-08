package app.tandem.foyer.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.domain.Agenda
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.ui.components.MemberAvatar
import app.tandem.foyer.ui.components.SectionHeader
import app.tandem.foyer.ui.components.currentLocale
import app.tandem.foyer.ui.components.formatLongDate
import java.time.format.DateTimeFormatter

/**
 * « Qui fait quoi » : une ligne par personne (puis « Tous les deux », « À définir »), une colonne
 * par jour sur 7 jours, le nombre de tâches par case. Toucher une case affiche ses tâches dessous.
 */
@Composable
fun WeekBoard(
    board: Agenda.WeekBoard,
    members: List<Member>,
    /** Ligne de tâche (index, nombre) : le même rendu que les autres sections d'Aujourd'hui. */
    taskRow: @Composable (Occurrence, Int, Int) -> Unit,
) {
    if (board.rows.none { r -> r.cells.any { it.isNotEmpty() } }) return
    val locale = currentLocale()
    // Police système agrandie : une lettre (« S ») plutôt que « Sa » coupé ; le numéro suit dessous.
    val weekday = DateTimeFormatter.ofPattern(if (LocalDensity.current.fontScale > 1.3f) "EEEEE" else "EEE", locale)
    var picked by rememberSaveable { mutableStateOf<String?>(null) }
    val together = stringResource(R.string.together)
    val unassigned = stringResource(R.string.unassigned)
    fun who(r: Agenda.BoardRow) = when (r.kind) {
        Agenda.BoardRowKind.MEMBER -> r.member!!.displayName
        Agenda.BoardRowKind.TOGETHER -> together
        Agenda.BoardRowKind.UNASSIGNED -> unassigned
    }
    fun keyOf(r: Agenda.BoardRow, day: Int) = "${r.member?.id ?: r.kind.name}/$day"

    SectionHeader(stringResource(R.string.board_title))
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth()) {
                Box(Modifier.width(NAME_WIDTH))
                board.days.forEachIndexed { i, d ->
                    Column(
                        Modifier.weight(1f).clearAndSetSemantics { },
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        val color = if (i == 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        Text(weekday.format(d).replaceFirstChar { it.titlecase(locale) }, style = MaterialTheme.typography.labelSmall, color = color, maxLines = 1)
                        Text(d.dayOfMonth.toString(), style = MaterialTheme.typography.labelSmall, color = color)
                    }
                }
            }
            board.rows.forEach { row ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.width(NAME_WIDTH).clearAndSetSemantics { }) { RowAvatar(row, members) }
                    row.cells.forEachIndexed { i, cell ->
                        val label = if (cell.isEmpty()) {
                            stringResource(R.string.board_cell_empty, who(row), formatLongDate(board.days[i], locale))
                        } else {
                            pluralStringResource(R.plurals.board_cell, cell.size, who(row), formatLongDate(board.days[i], locale), cell.size)
                        }
                        val key = keyOf(row, i)
                        val active = picked == key
                        Box(
                            Modifier
                                .weight(1f)
                                .padding(horizontal = 1.dp)
                                .height(48.dp)
                                .then(
                                    if (cell.isEmpty()) Modifier.clearAndSetSemantics { contentDescription = label }
                                    else Modifier
                                        .background(
                                            if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                            RoundedCornerShape(10.dp),
                                        )
                                        .clickable(role = Role.Button) { picked = if (active) null else key }
                                        .clearAndSetSemantics {
                                            contentDescription = label
                                            selected = active
                                        },
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                if (cell.isEmpty()) "·" else cell.size.toString(),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (cell.isEmpty()) FontWeight.Normal else FontWeight.Medium,
                                color = when {
                                    active -> MaterialTheme.colorScheme.onPrimary
                                    cell.isEmpty() -> MaterialTheme.colorScheme.onSurfaceVariant
                                    else -> MaterialTheme.colorScheme.onSurface
                                },
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
            Text(
                stringResource(R.string.board_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp, top = 4.dp),
            )
        }
    }
    board.rows.forEach { row ->
        row.cells.forEachIndexed { i, cell ->
            if (picked == keyOf(row, i) && cell.isNotEmpty()) {
                Text(
                    "${who(row)} · ${formatLongDate(board.days[i], locale)}",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(top = 12.dp, bottom = 6.dp),
                )
                Column { cell.forEachIndexed { j, o -> taskRow(o, j, cell.size) } }
            }
        }
    }
}

/** Pastille de la ligne : initiale du membre, deux pastilles « à deux », contour pointillé « à définir ». */
@Composable
private fun RowAvatar(row: Agenda.BoardRow, members: List<Member>) {
    when (row.kind) {
        Agenda.BoardRowKind.MEMBER -> MemberAvatar(row.member!!, 28)
        Agenda.BoardRowKind.TOGETHER -> Row(horizontalArrangement = Arrangement.spacedBy((-4).dp)) {
            members.take(2).forEach { MemberAvatar(it, 22) }
        }
        Agenda.BoardRowKind.UNASSIGNED -> Box(
            Modifier.size(24.dp).border(1.dp, MaterialTheme.colorScheme.outline, CircleShape),
        )
    }
}

private val NAME_WIDTH = 44.dp
