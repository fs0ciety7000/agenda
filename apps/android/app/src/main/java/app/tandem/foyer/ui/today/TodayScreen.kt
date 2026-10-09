package app.tandem.foyer.ui.today

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.domain.Agenda
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.ui.components.EmptyState
import app.tandem.foyer.ui.components.MemberAvatar
import app.tandem.foyer.ui.components.SectionHeader
import app.tandem.foyer.ui.components.SyncBanner
import app.tandem.foyer.ui.components.TaskRow
import app.tandem.foyer.ui.components.groupedCard
import app.tandem.foyer.ui.components.currentLocale
import app.tandem.foyer.ui.components.formatDuration
import app.tandem.foyer.ui.components.formatLongDate
import app.tandem.foyer.ui.main.AgendaUiState
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.ui.res.painterResource

/** Tableau de bord : en retard, aujourd'hui, 7 prochains jours, répartition de la semaine. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(
    state: AgendaUiState,
    onRefresh: () -> Unit,
    onToggle: (Occurrence) -> Unit,
    onOpen: (Occurrence) -> Unit,
    onShowUnscheduled: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(),
    /** Bandeau optionnel en haut (ex. nouvelle version de l'app). */
    banner: @Composable () -> Unit = {},
    onThank: (Occurrence, Boolean) -> Unit = { _, _ -> },
) {
    val sections = Agenda.todaySections(state.occurrences, state.today)
    val members = state.members
    val locale = currentLocale()
    PullToRefreshBox(
        isRefreshing = state.sync.refreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize().padding(contentPadding),
    ) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 96.dp)) {
            item {
                Row(
                    Modifier.padding(bottom = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    // Décoratif : le nom de l'app est lu juste à côté.
                    Image(painterResource(R.drawable.logo), contentDescription = null, modifier = Modifier.size(28.dp))
                    Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Text(
                    stringResource(R.string.greeting, state.me?.displayName ?: ""),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    formatLongDate(state.today, locale),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SyncBanner(state.online, state.sync)
                banner()
            }
            if (sections.overdue.isNotEmpty()) {
                item { SectionHeader(stringResource(R.string.today_catch_up), trailing = sections.overdue.size.toString()) }
                itemsIndexed(sections.overdue, key = { _, it -> "o-" + it.id }) { i, it ->
                    TaskRow(it, members, { onToggle(it) }, { onOpen(it) }, myMemberId = state.myMemberId, onThank = { t -> onThank(it, t) }, today = state.today, showDate = true, modifier = Modifier.groupedCard(i, sections.overdue.size))
                }
            }
            item {
                SectionHeader(
                    stringResource(R.string.today),
                    trailing = if (sections.today.isEmpty()) null
                    else stringResource(R.string.today_progress, sections.todayDone, sections.today.size),
                )
            }
            if (sections.today.isEmpty()) {
                item { EmptyState(stringResource(R.string.today_empty_title), stringResource(R.string.today_empty_body), illustration = R.drawable.ill_empty_today) }
            } else {
                itemsIndexed(sections.today, key = { _, it -> "t-" + it.id }) { i, it -> TaskRow(it, members, { onToggle(it) }, { onOpen(it) }, myMemberId = state.myMemberId, onThank = { t -> onThank(it, t) }, modifier = Modifier.groupedCard(i, sections.today.size)) }
            }
            state.household?.let { household ->
                item(key = "board") {
                    WeekBoard(Agenda.weekBoard(state.occurrences, state.today, household.members), household.members) { o, i, n ->
                        TaskRow(o, members, { onToggle(o) }, { onOpen(o) }, myMemberId = state.myMemberId, onThank = { t -> onThank(o, t) }, modifier = Modifier.groupedCard(i, n))
                    }
                }
            }
            if (sections.dueThisWeek.isNotEmpty()) {
                item { SectionHeader(stringResource(R.string.due_section), trailing = sections.dueThisWeek.size.toString()) }
                itemsIndexed(sections.dueThisWeek, key = { _, it -> "d-" + it.id }) { i, it ->
                    TaskRow(it, members, { onToggle(it) }, { onOpen(it) }, myMemberId = state.myMemberId, onThank = { t -> onThank(it, t) }, today = state.today, modifier = Modifier.groupedCard(i, sections.dueThisWeek.size))
                }
            }
            item { SectionHeader(stringResource(R.string.this_week)) }
            if (sections.upcoming.isEmpty()) {
                item {
                    Text(
                        stringResource(R.string.week_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }
            } else {
                itemsIndexed(sections.upcoming, key = { _, it -> "w-" + it.id }) { i, it ->
                    TaskRow(it, members, { onToggle(it) }, { onOpen(it) }, myMemberId = state.myMemberId, onThank = { t -> onThank(it, t) }, today = state.today, showDate = true, modifier = Modifier.groupedCard(i, sections.upcoming.size))
                }
            }
            if (sections.unscheduledCount > 0) {
                item {
                    Text(
                        pluralStringResource(R.plurals.unscheduled_count, sections.unscheduledCount, sections.unscheduledCount),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onShowUnscheduled)
                            .padding(vertical = 14.dp),
                    )
                }
            }
            state.household?.let { household ->
                item { BalanceCard(Agenda.weekBalance(state.occurrences, state.today, household.members)) }
            }
        }
    }
}

@Composable
private fun BalanceCard(balance: Agenda.Balance) {
    val max = maxOf(1, balance.members.maxOfOrNull { it.second.count } ?: 0, balance.together.count, balance.unassigned.count)
    // Même couleur neutre pour chacun : la répartition informe, elle ne classe pas.
    val person = MaterialTheme.colorScheme.onSurfaceVariant
    val neutral = MaterialTheme.colorScheme.outline
    SectionHeader(stringResource(R.string.balance_title))
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            balance.members.forEach { (member, share) ->
                BalanceRow(member.displayName, share, max, person) { MemberAvatar(member, 28) }
            }
            BalanceRow(stringResource(R.string.balance_together), balance.together, max, neutral, null)
            BalanceRow(stringResource(R.string.balance_unassigned), balance.unassigned, max, neutral, null)
            Text(
                stringResource(R.string.balance_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun BalanceRow(
    label: String,
    share: Agenda.Share,
    max: Int,
    barColor: Color,
    avatar: (@Composable () -> Unit)?,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        if (avatar != null) avatar() else Spacer(Modifier.width(28.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Text(
                    pluralStringResource(R.plurals.balance_row, share.count, share.count, formatDuration(share.minutes)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // Barre décorative : l'identité est portée par le nom et l'initiale, pas par la couleur.
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                if (share.count > 0) {
                    Box(
                        Modifier
                            .fillMaxWidth(share.count.toFloat() / max)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(3.dp))
                            .background(barColor),
                    )
                }
            }
        }
    }
}
