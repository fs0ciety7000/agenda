package app.tandem.foyer.ui.tasks

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.domain.Agenda
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.ui.components.EmptyState
import app.tandem.foyer.ui.components.SectionHeader
import app.tandem.foyer.ui.components.SyncBanner
import app.tandem.foyer.ui.components.TaskRow
import app.tandem.foyer.ui.components.currentLocale
import app.tandem.foyer.ui.components.formatLongDate
import app.tandem.foyer.ui.main.AgendaUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen(
    state: AgendaUiState,
    filter: Agenda.Filter,
    onFilter: (Agenda.Filter) -> Unit,
    onRefresh: () -> Unit,
    onToggle: (Occurrence) -> Unit,
    onOpen: (Occurrence) -> Unit,
    contentPadding: PaddingValues = PaddingValues(),
) {
    val list = Agenda.filter(state.occurrences, filter, state.today, state.myMemberId)
    val locale = currentLocale()
    Column(Modifier.fillMaxSize().padding(contentPadding)) {
        Column(Modifier.padding(horizontal = 16.dp).padding(top = 16.dp)) {
            OutlinedTextField(
                value = filter.query,
                onValueChange = { onFilter(filter.copy(query = it)) },
                label = { Text(stringResource(R.string.search)) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = {
                    if (filter.query.isNotEmpty()) {
                        IconButton(onClick = { onFilter(filter.copy(query = "")) }) {
                            Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.clear))
                        }
                    }
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    Agenda.View.TODO to R.string.filter_todo,
                    Agenda.View.UPCOMING to R.string.filter_upcoming,
                    Agenda.View.UNSCHEDULED to R.string.filter_unscheduled,
                    Agenda.View.DONE to R.string.filter_done,
                ).forEach { (view, label) ->
                    FilterChip(
                        selected = filter.view == view,
                        onClick = { onFilter(filter.copy(view = view)) },
                        label = { Text(stringResource(label)) },
                    )
                }
                FilterChip(
                    selected = filter.who == Agenda.Who.ME,
                    onClick = {
                        onFilter(filter.copy(who = if (filter.who == Agenda.Who.ME) Agenda.Who.EVERYONE else Agenda.Who.ME))
                    },
                    label = { Text(stringResource(R.string.filter_mine)) },
                )
            }
            SyncBanner(state.online, state.sync)
        }
        PullToRefreshBox(isRefreshing = state.sync.refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp)) {
                if (list.isEmpty()) item { EmptyState(stringResource(R.string.tasks_empty)) }
                // Groupes par jour (sauf « Faites », triées par date de complétion).
                val groups = if (filter.view == Agenda.View.DONE) listOf(null to list) else list.groupBy { it.date }.toList()
                groups.forEach { (date, rows) ->
                    if (filter.view != Agenda.View.DONE) {
                        item(key = "h-$date") {
                            SectionHeader(
                                when (date) {
                                    null -> stringResource(R.string.no_date)
                                    state.today -> stringResource(R.string.today)
                                    else -> formatLongDate(date, locale)
                                },
                            )
                        }
                    }
                    items(rows, key = { it.id }) { TaskRow(it, state.members, { onToggle(it) }, { onOpen(it) }) }
                }
            }
        }
    }
}
