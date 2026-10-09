package app.tandem.foyer.ui.search

import androidx.annotation.DrawableRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.data.SearchRemote
import app.tandem.foyer.data.remote.SearchResultsDto
import app.tandem.foyer.domain.Money
import app.tandem.foyer.ui.components.currentLocale
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.MonthDay
import java.time.format.DateTimeFormatter

/** Où mène un résultat : l'occurrence d'une tâche, ou la page concernée. */
sealed interface SearchTarget {
    data class Task(val occurrenceId: String) : SearchTarget
    data class Page(val route: String) : SearchTarget
}

/** Écran Dépenses ouvert sur le mois de la dépense (`date` au format AAAA-MM-JJ). */
fun expenseRoute(date: String) = "expenses?month=" + date.take(7)

/** Recherche globale : tâches, notes, dates, dépenses et courses du foyer (en ligne). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(remote: SearchRemote, onBack: () -> Unit, onOpen: (SearchTarget) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<SearchResultsDto?>(null) }
    var failed by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    // Une requête par pause de frappe, pas une par lettre.
    LaunchedEffect(text) {
        val q = text.trim()
        if (q.length < 2) {
            results = null
            failed = false
            return@LaunchedEffect
        }
        delay(250)
        val r = remote.search(q)
        failed = r == null
        results = r
    }
    val locale = currentLocale()
    val dayFormat = remember(locale) { DateTimeFormatter.ofPattern("d MMM", locale) }
    val monthDayFormat = remember(locale) { DateTimeFormatter.ofPattern("d MMMM", locale) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.search_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it.take(100) },
                label = { Text(stringResource(R.string.search_label)) },
                placeholder = { Text(stringResource(R.string.search_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).focusRequester(focus),
            )
            val r = results
            val message = when {
                text.trim().length < 2 -> stringResource(R.string.search_hint)
                failed -> stringResource(R.string.search_offline)
                r != null && r.isEmpty -> stringResource(R.string.search_empty, text.trim())
                else -> null
            }
            if (message != null) {
                Text(
                    message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            }
            if (r != null && !r.isEmpty) {
                val doneLabel = stringResource(R.string.search_done)
                val inCart = stringResource(R.string.search_in_cart)
                val toBuy = stringResource(R.string.search_to_buy)
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                    group(R.string.search_tasks, r.tasks, { it.occurrenceId }) { t ->
                        Result(
                            R.drawable.ic_share_task,
                            t.title,
                            listOfNotNull(t.date?.let { LocalDate.parse(it).format(dayFormat) }, doneLabel.takeIf { t.done }).joinToString(" · "),
                        ) { onOpen(SearchTarget.Task(t.occurrenceId)) }
                    }
                    group(R.string.search_notes, r.notes, { it.id }) { n ->
                        Result(R.drawable.ic_drawer_note, n.title, n.snippet) { onOpen(SearchTarget.Page("notes")) }
                    }
                    group(R.string.search_dates, r.dates, { it.id }) { d ->
                        Result(R.drawable.ic_drawer_cake, d.title, MonthDay.of(d.month, d.day).format(monthDayFormat)) {
                            onOpen(SearchTarget.Page("dates"))
                        }
                    }
                    group(R.string.search_expenses, r.expenses, { it.id }) { e ->
                        Result(
                            R.drawable.ic_drawer_wallet,
                            e.title,
                            "${LocalDate.parse(e.date).format(dayFormat)} · ${Money.format(e.amountCents, locale)}",
                        ) { onOpen(SearchTarget.Page(expenseRoute(e.date))) }
                    }
                    group(R.string.search_shopping, r.shopping, { it.id }) { s ->
                        Result(R.drawable.ic_share_cart, s.text, if (s.done) inCart else toBuy) { onOpen(SearchTarget.Page("shopping")) }
                    }
                }
            }
        }
    }
}

private fun <T> LazyListScope.group(title: Int, list: List<T>, key: (T) -> String, row: @Composable (T) -> Unit) {
    if (list.isEmpty()) return
    item(key = "h$title") {
        Text(
            stringResource(title).uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp).semantics { heading() },
        )
    }
    items(list, key = { "$title-${key(it)}" }) { row(it) }
}

@Composable
private fun Result(@DrawableRes icon: Int, title: String, meta: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (meta.isNotEmpty()) {
                Text(
                    meta,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
