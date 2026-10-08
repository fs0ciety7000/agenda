package app.tandem.foyer.ui.components

import androidx.compose.foundation.background
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.Check
import androidx.compose.runtime.getValue
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.semantics.Role
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
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.domain.model.CalendarSync
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.domain.model.MemberColor
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.domain.model.Priority
import app.tandem.foyer.domain.model.Visibility
import app.tandem.foyer.domain.repository.SyncState
import app.tandem.foyer.ui.theme.Tokens
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
            color = if (isSystemInDarkTheme()) Tokens.Dark.onMember else Tokens.Light.onMember,
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
    /** Par exemple [groupedCard] : les lignes d'une section dans une même carte, comme sur le site. */
    modifier: Modifier = Modifier,
    today: LocalDate? = null,
    showDate: Boolean = false,
    myMemberId: String? = null,
    /** « Merci » : présent quand l'écran sait l'envoyer (tâche faite par quelqu'un d'autre). */
    onThank: ((Boolean) -> Unit)? = null,
) {
    val locale = currentLocale()
    val doneBy = o.completedById?.takeIf { o.isDone }
    val canThank = onThank != null && doneBy != null && myMemberId != null && doneBy != myMemberId
    val iThanked = myMemberId != null && myMemberId in o.thankedBy
    val thanksReceived = if (doneBy != null && doneBy == myMemberId) o.thankedBy.filter { it != myMemberId } else emptyList()
    val meta = buildList {
        if (showDate && o.date != null && today != null) add(formatShortDate(o.date, locale, today))
        if (o.date == null && o.dueDate != null) add(dueLabel(o.dueDate, today ?: LocalDate.now(), locale))
        o.startMinute?.let { add(formatMinute(it)) }
        o.category?.let { add(listOfNotNull(it.emoji, it.name).joinToString(" ")) }
        add(assigneeLabel(o, members))
        if (o.visibility == Visibility.PERSONAL) add(stringResource(R.string.personal))
        if (o.isRecurring) add("↻")
        if (o.checklist.isNotEmpty()) add(stringResource(R.string.checklist_row, o.checklist.count { it.done }, o.checklist.size))
        if (thanksReceived.isNotEmpty()) {
            add("♥ " + stringResource(R.string.thanks_from, thanksReceived.joinToString(" & ") { members[it]?.displayName ?: "?" }))
        }
    }.joinToString(" · ")
    val priority = when (o.priority) {
        Priority.URGENT -> stringResource(R.string.priority_urgent)
        Priority.HIGH -> stringResource(R.string.priority_high)
        else -> null
    }
    val toggleLabel = stringResource(if (o.isDone) R.string.mark_todo else R.string.mark_done, o.title)
    Row(
        modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onOpen).padding(end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TaskCheck(checked = o.isDone, onToggle = onToggle, label = toggleLabel)
        Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
            Text(
                o.title,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textDecoration = if (o.isDone) TextDecoration.LineThrough else null,
                color = if (o.isDone) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            )
            // Priorité : seul le chevron et son libellé sont colorés (haute = warning, urgente =
            // danger), le reste de la ligne reste discret (design system §2).
            val dark = isSystemInDarkTheme()
            val priorityColor = when (o.priority) {
                Priority.URGENT -> if (dark) Tokens.Dark.danger else Tokens.Light.danger
                else -> if (dark) Tokens.Dark.warning else Tokens.Light.warning
            }
            Text(
                buildAnnotatedString {
                    if (priority != null && !o.isDone) {
                        withStyle(SpanStyle(color = priorityColor)) { append("⌃ $priority") }
                        if (meta.isNotEmpty()) append(" · ")
                    }
                    append(meta)
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (canThank) {
            val name = members[doneBy]?.displayName ?: "?"
            val label = stringResource(if (iThanked) R.string.thanks_sent else R.string.say_thanks, name)
            IconButton(
                onClick = { onThank?.invoke(!iThanked) },
                modifier = Modifier.semantics { contentDescription = label; stateDescription = label },
            ) {
                Icon(
                    if (iThanked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = null,
                    tint = if (iThanked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
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
        due == app.tandem.foyer.domain.Agenda.endOfWeek(today) -> stringResource(R.string.due_this_week)
        due == app.tandem.foyer.domain.Agenda.endOfMonth(today) -> stringResource(R.string.due_this_month)
        else -> stringResource(R.string.due_by, date)
    }
}

/**
 * Case de tâche du design system : cercle de 22 dp dans une cible de 48 dp, coche animée
 * (180 ms, rebond léger ; instantanée si les animations sont réduites).
 */
@Composable
fun TaskCheck(checked: Boolean, onToggle: () -> Unit, label: String) {
    val dark = isSystemInDarkTheme()
    val success = if (dark) Tokens.Dark.success else Tokens.Light.success
    val scale by animateFloatAsState(
        targetValue = if (checked) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = 900f),
        label = "check",
    )
    Box(
        Modifier
            .size(48.dp)
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = { onToggle() })
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(22.dp)
                .border(1.5.dp, if (checked) success else MaterialTheme.colorScheme.onSurfaceVariant, CircleShape)
                .background(if (checked) success else Color.Transparent, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (scale > 0f) {
                Icon(
                    Icons.Filled.Check,
                    contentDescription = null,
                    tint = if (dark) Tokens.Dark.surface else Tokens.Light.surface,
                    modifier = Modifier.size(14.dp).scale(scale),
                )
            }
        }
    }
}

/**
 * Une ligne d'une section affichée comme une carte commune (surface, bordure fine, rayon `lg`) :
 * coins arrondis en haut pour la première, en bas pour la dernière. Les lignes suivantes
 * remontent d'1 dp pour que deux bordures voisines n'en fassent qu'une.
 */
@Composable
fun Modifier.groupedCard(index: Int, count: Int): Modifier {
    val radius = Tokens.Radius.lg
    val shape = RoundedCornerShape(
        topStart = if (index == 0) radius else 0.dp,
        topEnd = if (index == 0) radius else 0.dp,
        bottomStart = if (index == count - 1) radius else 0.dp,
        bottomEnd = if (index == count - 1) radius else 0.dp,
    )
    return this
        .offset(y = if (index == 0) 0.dp else (-1).dp * index)
        .clip(shape)
        .background(MaterialTheme.colorScheme.surface, shape)
        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
}
