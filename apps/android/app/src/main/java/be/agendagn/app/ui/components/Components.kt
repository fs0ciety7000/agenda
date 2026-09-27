package be.agendagn.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import be.agendagn.app.R
import be.agendagn.app.domain.model.CalendarSync
import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.MemberColor
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.Priority
import be.agendagn.app.domain.model.Visibility
import be.agendagn.app.domain.repository.SyncState
import be.agendagn.app.ui.theme.Tokens
import androidx.compose.foundation.isSystemInDarkTheme
import java.time.LocalDate

@Composable
fun memberColor(color: MemberColor): Color {
    val dark = isSystemInDarkTheme()
    return when (color) {
        MemberColor.SAGE -> if (dark) Tokens.MemberDark.sage else Tokens.MemberLight.sage
        MemberColor.OCEAN -> if (dark) Tokens.MemberDark.ocean else Tokens.MemberLight.ocean
        MemberColor.AMBER -> if (dark) Tokens.MemberDark.amber else Tokens.MemberLight.amber
        MemberColor.PLUM -> if (dark) Tokens.MemberDark.plum else Tokens.MemberLight.plum
        MemberColor.CLAY -> if (dark) Tokens.MemberDark.clay else Tokens.MemberLight.clay
        MemberColor.SLATE -> if (dark) Tokens.MemberDark.slate else Tokens.MemberLight.slate
    }
}

@Composable
fun MemberAvatar(member: Member, size: Int = 24) {
    Box(
        Modifier.size(size.dp).background(memberColor(member.color), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            member.displayName.take(1).uppercase(),
            color = if (isSystemInDarkTheme()) Tokens.Dark.bg else Color.White,
            style = if (size >= 32) MaterialTheme.typography.titleSmall else MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier, trailing: String? = null) {
    Row(
        modifier.fillMaxWidth().padding(top = 20.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing?.let {
            Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Qui s'en occupe : « Grace », « à deux », « À définir ». */
@Composable
fun assigneeLabel(o: Occurrence, members: Map<String, Member>): String = when {
    o.assigneeIds.isEmpty() -> stringResource(R.string.unassigned)
    o.assigneeIds.size > 1 -> stringResource(R.string.together)
    else -> members[o.assigneeIds.first()]?.displayName ?: "?"
}

/**
 * Ligne de tâche : case à cocher (48 dp), titre, puis heure · catégorie · responsable.
 * Lecteur d'écran : la ligne se lit d'un bloc, la case annonce l'action.
 */
@Composable
fun TaskRow(
    o: Occurrence,
    members: Map<String, Member>,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    today: LocalDate? = null,
    showDate: Boolean = false,
) {
    val locale = currentLocale()
    val meta = buildList {
        if (showDate && o.date != null && today != null) add(formatShortDate(o.date, locale, today))
        if (o.date == null && o.dueDate != null) add(dueLabel(o.dueDate, today ?: LocalDate.now(), locale))
        o.startMinute?.let { add(formatMinute(it)) }
        o.category?.let { add(listOfNotNull(it.emoji, it.name).joinToString(" ")) }
        add(assigneeLabel(o, members))
        if (o.visibility == Visibility.PERSONAL) add(stringResource(R.string.personal))
        if (o.isRecurring) add("↻")
        if (o.checklist.isNotEmpty()) add(stringResource(R.string.checklist_row, o.checklist.count { it.done }, o.checklist.size))
    }.joinToString(" · ")
    val priority = when (o.priority) {
        Priority.URGENT -> stringResource(R.string.priority_urgent)
        Priority.HIGH -> stringResource(R.string.priority_high)
        else -> null
    }
    val toggleLabel = stringResource(if (o.isDone) R.string.mark_todo else R.string.mark_done, o.title)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onOpen).padding(end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = o.isDone,
            onCheckedChange = { onToggle() },
            modifier = Modifier.semantics { contentDescription = toggleLabel },
        )
        Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
            Text(
                o.title,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textDecoration = if (o.isDone) TextDecoration.LineThrough else null,
                color = if (o.isDone) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            )
            Text(
                listOfNotNull(priority, meta).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = if (priority != null && !o.isDone) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        SyncIcon(o)
    }
}

@Composable
private fun SyncIcon(o: Occurrence) {
    val (icon, label, tint) = when {
        o.pending -> Triple(Icons.Filled.Refresh, R.string.pending_badge, MaterialTheme.colorScheme.onSurfaceVariant)
        o.calendarSync == CalendarSync.ERROR || o.calendarSync == CalendarSync.BLOCKED ->
            Triple(Icons.Filled.Warning, R.string.calendar_error_badge, MaterialTheme.colorScheme.error)
        o.calendarSync == CalendarSync.PENDING ->
            Triple(Icons.Filled.Refresh, R.string.calendar_pending_badge, MaterialTheme.colorScheme.onSurfaceVariant)
        o.calendarSync == CalendarSync.SYNCED ->
            Triple(Icons.Filled.CheckCircle, R.string.calendar_synced_badge, MaterialTheme.colorScheme.primary)
        else -> return
    }
    Icon(icon, contentDescription = stringResource(label), tint = tint, modifier = Modifier.size(18.dp))
}

/** Bandeau d'état réseau / synchronisation (annoncé poliment aux lecteurs d'écran). */
@Composable
fun SyncBanner(online: Boolean, sync: SyncState) {
    val text = when {
        !online && sync.pending > 0 -> pluralStringResource(R.plurals.offline_pending, sync.pending, sync.pending)
        !online -> stringResource(R.string.offline)
        sync.rejected > 0 -> stringResource(R.string.sync_rejected)
        sync.pending > 0 -> pluralStringResource(R.plurals.syncing_pending, sync.pending, sync.pending)
        else -> return
    }
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
    ) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(if (online) Icons.Filled.Refresh else Icons.Filled.Warning, contentDescription = null, modifier = Modifier.size(18.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.semantics { liveRegionPolite() })
        }
    }
}

@Composable
fun EmptyState(title: String, body: String? = null) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 16.dp).clearAndSetSemantics {
            contentDescription = listOfNotNull(title, body).joinToString(". ")
        },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        body?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Échéance souple : « Cette semaine », « Ce mois-ci », « Avant le … », « Échéance dépassée (…) ». */
@Composable
fun dueLabel(due: LocalDate, today: LocalDate, locale: java.util.Locale): String {
    val date = formatShortDate(due, locale, today)
    return when {
        due < today -> stringResource(R.string.due_overdue, date)
        due == be.agendagn.app.domain.Agenda.endOfWeek(today) -> stringResource(R.string.due_this_week)
        due == be.agendagn.app.domain.Agenda.endOfMonth(today) -> stringResource(R.string.due_this_month)
        else -> stringResource(R.string.due_by, date)
    }
}
