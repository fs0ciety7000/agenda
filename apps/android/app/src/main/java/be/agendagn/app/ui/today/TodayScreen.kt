package be.agendagn.app.ui.today

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
import be.agendagn.app.R
import be.agendagn.app.domain.Agenda
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.ui.components.EmptyState
import be.agendagn.app.ui.components.MemberAvatar
import be.agendagn.app.ui.components.SectionHeader
import be.agendagn.app.ui.components.SyncBanner
import be.agendagn.app.ui.components.TaskRow
import be.agendagn.app.ui.components.currentLocale
import be.agendagn.app.ui.components.formatDuration
import be.agendagn.app.ui.components.formatLongDate
import be.agendagn.app.ui.main.AgendaUiState

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
                item { SectionHeader(stringResource(R.string.overdue), trailing = sections.overdue.size.toString()) }
                items(sections.overdue, key = { "o-" + it.id }) {
                    TaskRow(it, members, { onToggle(it) }, { onOpen(it) }, today = state.today, showDate = true)
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
                item { EmptyState(stringResource(R.string.today_empty_title), stringResource(R.string.today_empty_body)) }
            } else {
                items(sections.today, key = { "t-" + it.id }) { TaskRow(it, members, { onToggle(it) }, { onOpen(it) }) }
            }
            if (sections.dueThisWeek.isNotEmpty()) {
                item { SectionHeader(stringResource(R.string.due_section), trailing = sections.dueThisWeek.size.toString()) }
                items(sections.dueThisWeek, key = { "d-" + it.id }) {
                    TaskRow(it, members, { onToggle(it) }, { onOpen(it) }, today = state.today)
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
                items(sections.upcoming, key = { "w-" + it.id }) {
                    TaskRow(it, members, { onToggle(it) }, { onOpen(it) }, today = state.today, showDate = true)
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
    SectionHeader(stringResource(R.string.balance_title))
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            balance.members.forEach { (member, share) ->
                BalanceRow(member.displayName, share) { MemberAvatar(member, 28) }
            }
            BalanceRow(stringResource(R.string.balance_together), balance.together, null)
            BalanceRow(stringResource(R.string.balance_unassigned), balance.unassigned, null)
            Text(
                stringResource(R.string.balance_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun BalanceRow(label: String, share: Agenda.Share, avatar: (@Composable () -> Unit)?) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        if (avatar != null) avatar() else Spacer(Modifier.width(28.dp))
        Spacer(Modifier.width(12.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Text(
            pluralStringResource(R.plurals.balance_row, share.count, share.count, formatDuration(share.minutes)),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
