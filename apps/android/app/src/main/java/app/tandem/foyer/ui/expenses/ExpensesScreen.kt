package app.tandem.foyer.ui.expenses

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.tandem.foyer.R
import app.tandem.foyer.data.ExpensesRemote
import app.tandem.foyer.data.remote.ExpenseBody
import app.tandem.foyer.data.remote.ExpenseDto
import app.tandem.foyer.data.remote.ExpenseSummaryDto
import app.tandem.foyer.domain.Money
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.ui.components.EmptyState
import app.tandem.foyer.ui.components.MemberAvatar
import app.tandem.foyer.ui.components.currentLocale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle

data class ExpensesState(
    val month: YearMonth = YearMonth.now(),
    val items: List<ExpenseDto> = emptyList(),
    val summary: ExpenseSummaryDto? = null,
    val loading: Boolean = true,
    val offline: Boolean = false,
    val saving: Boolean = false,
)

class ExpensesViewModel(private val remote: ExpensesRemote) : ViewModel() {
    private val _state = MutableStateFlow(ExpensesState())
    val state: StateFlow<ExpensesState> = _state

    init {
        load()
    }

    fun load() {
        val month = _state.value.month
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val result = remote.month(month.toString())
            // Mois changé entre-temps : la réponse ne vaut plus rien.
            if (_state.value.month != month) return@launch
            _state.update {
                it.copy(
                    items = result?.first ?: it.items,
                    summary = result?.second ?: it.summary,
                    loading = false,
                    offline = result == null,
                )
            }
        }
    }

    fun shiftMonth(delta: Long) {
        _state.update { it.copy(month = it.month.plusMonths(delta), items = emptyList(), summary = null) }
        load()
    }

    fun save(editingId: String?, body: ExpenseBody, done: (Boolean) -> Unit) = perform(done) { remote.save(editingId, body) }

    fun settle(from: String, to: String, cents: Long, done: (Boolean) -> Unit) = perform(done) { remote.settle(from, to, cents) }

    fun delete(id: String, done: (Boolean) -> Unit) = perform(done) { remote.delete(id) }

    private fun perform(done: (Boolean) -> Unit, action: suspend () -> Boolean) {
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val ok = action()
            _state.update { it.copy(saving = false) }
            done(ok)
            if (ok) load()
        }
    }
}

/** Ce qu'édite la feuille : null = fermée ; expense null = nouvelle dépense. */
private data class Editing(val expense: ExpenseDto?)

/** Dépenses du foyer : qui a payé quoi, la part de chacun, et qui doit combien à qui. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpensesScreen(
    vm: ExpensesViewModel,
    members: List<Member>,
    myMemberId: String?,
    onBack: () -> Unit,
    onMessage: (String) -> Unit,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val locale = currentLocale()
    val money = { cents: Long -> Money.format(cents, locale) }
    val former = stringResource(R.string.history_former_member)
    val name = { id: String? -> members.firstOrNull { it.id == id }?.displayName ?: former }
    val dayFormat = remember(locale) { DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL).withLocale(locale) }
    var editing by remember { mutableStateOf<Editing?>(null) }
    val failed = stringResource(R.string.expenses_failed)
    val settledMsg = stringResource(R.string.expenses_settled)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.expenses_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
                    }
                },
            )
        },
        floatingActionButton = {
            if (!state.offline) {
                ExtendedFloatingActionButton(
                    onClick = { editing = Editing(null) },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text(stringResource(R.string.expenses_add)) },
                )
            }
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "month") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        state.month.month.getDisplayName(TextStyle.FULL_STANDALONE, locale)
                            .replaceFirstChar { it.titlecase(locale) } + " " + state.month.year,
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.weight(1f).semantics { heading() },
                    )
                    IconButton(onClick = { vm.shiftMonth(-1) }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = stringResource(R.string.expenses_prev_month))
                    }
                    IconButton(onClick = { vm.shiftMonth(1) }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = stringResource(R.string.expenses_next_month))
                    }
                }
            }
            if (state.offline) {
                item(key = "offline") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.expenses_offline))
                        OutlinedButton(onClick = vm::load, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.retry))
                        }
                    }
                }
            }
            state.summary?.let { s ->
                item(key = "balance") {
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                stringResource(R.string.expenses_balance_title),
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.semantics { heading() },
                            )
                            if (s.transfers.isEmpty()) {
                                Text("✓ " + stringResource(R.string.expenses_even), color = MaterialTheme.colorScheme.primary)
                            }
                            s.transfers.forEach { t ->
                                Text(
                                    stringResource(R.string.expenses_owes, name(t.fromMemberId), name(t.toMemberId), money(t.amountCents)),
                                    style = MaterialTheme.typography.bodyLarge,
                                )
                                OutlinedButton(
                                    onClick = {
                                        vm.settle(t.fromMemberId, t.toMemberId, t.amountCents) { ok ->
                                            onMessage(if (ok) settledMsg else failed)
                                        }
                                    },
                                    enabled = !state.saving,
                                    modifier = Modifier.heightIn(min = 48.dp),
                                ) { Text(stringResource(R.string.expenses_settle)) }
                            }
                            val total = s.members.sumOf { it.weight }.coerceAtLeast(1)
                            Text(
                                stringResource(
                                    R.string.expenses_split_hint,
                                    s.members.joinToString(" / ") { "${Math.round(it.weight * 100.0 / total)}" },
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                item(key = "totals") {
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                stringResource(R.string.expenses_month_title),
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.semantics { heading() },
                            )
                            AmountLine(stringResource(R.string.expenses_common), money(s.commonCents))
                            s.members.forEach { m ->
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    members.firstOrNull { it.id == m.memberId }?.let { MemberAvatar(it, 28) }
                                    Column {
                                        Text(name(m.memberId), style = MaterialTheme.typography.bodyLarge)
                                        Text(
                                            stringResource(R.string.expenses_member_line, money(m.paidCents), money(m.shareCents)),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                            HorizontalDivider()
                            AmountLine(stringResource(R.string.expenses_mine), money(s.mineCents))
                        }
                    }
                }
            }
            if (!state.loading && !state.offline && state.items.isEmpty()) {
                item(key = "empty") {
                    EmptyState(stringResource(R.string.expenses_empty_title), stringResource(R.string.expenses_empty_body))
                }
            }
            state.items.groupBy { it.date }.forEach { (date, items) ->
                item(key = "day-$date") {
                    Text(
                        LocalDate.parse(date).format(dayFormat),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp).semantics { heading() },
                    )
                }
                items(items, key = { it.id }) { e ->
                    ExpenseRow(e, name, money) { editing = Editing(e) }
                }
            }
        }
    }

    editing?.let { current ->
        ExpenseSheet(
            expense = current.expense,
            members = members,
            defaultPayer = myMemberId ?: members.firstOrNull()?.id.orEmpty(),
            saving = state.saving,
            onDismiss = { editing = null },
            onSave = { body ->
                vm.save(current.expense?.id, body) { ok ->
                    if (ok) editing = null else onMessage(failed)
                }
            },
            onDelete = { id ->
                vm.delete(id) { ok ->
                    if (ok) editing = null else onMessage(failed)
                }
            },
        )
    }
}

@Composable
private fun AmountLine(label: String, amount: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Text(amount, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun ExpenseRow(e: ExpenseDto, name: (String?) -> String, money: (Long) -> String, onClick: () -> Unit) {
    val settlement = e.kind == "SETTLEMENT"
    OutlinedCard(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(if (settlement) "↔️" else Money.CATEGORY_EMOJI[e.category] ?: "📦", style = MaterialTheme.typography.titleLarge)
            Column(Modifier.weight(1f)) {
                Text(
                    if (settlement) stringResource(R.string.expenses_settlement) else e.title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    when {
                        settlement -> stringResource(R.string.expenses_meta_settlement, name(e.paidById), name(e.forMemberId))
                        e.split == "FOR_OTHER" -> stringResource(R.string.expenses_meta_for_other, name(e.paidById), name(e.forMemberId))
                        e.split == "PERSONAL" -> stringResource(R.string.expenses_meta_personal, name(e.paidById))
                        else -> stringResource(R.string.expenses_meta_shared, name(e.paidById))
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                e.note?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                }
            }
            Text(money(e.amountCents), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun categoryLabel(category: String): String = stringResource(
    when (category) {
        "GROCERIES" -> R.string.expense_cat_groceries
        "HOUSING" -> R.string.expense_cat_housing
        "UTILITIES" -> R.string.expense_cat_utilities
        "TRANSPORT" -> R.string.expense_cat_transport
        "LEISURE" -> R.string.expense_cat_leisure
        "HEALTH" -> R.string.expense_cat_health
        "KIDS" -> R.string.expense_cat_kids
        "GIFTS" -> R.string.expense_cat_gifts
        else -> R.string.expense_cat_other
    },
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ExpenseSheet(
    expense: ExpenseDto?,
    members: List<Member>,
    defaultPayer: String,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (ExpenseBody) -> Unit,
    onDelete: (String) -> Unit,
) {
    val locale = currentLocale()
    val settlement = expense?.kind == "SETTLEMENT"
    var amount by rememberSaveable { mutableStateOf(expense?.let { Money.editable(it.amountCents, locale) } ?: "") }
    var title by rememberSaveable { mutableStateOf(expense?.title ?: "") }
    var date by rememberSaveable { mutableStateOf(expense?.date ?: LocalDate.now().toString()) }
    var paidBy by rememberSaveable { mutableStateOf(expense?.paidById ?: defaultPayer) }
    // « SHARED », « PERSONAL » ou l'identifiant du membre pour qui la dépense a été avancée.
    var target by rememberSaveable {
        mutableStateOf(if (expense?.split == "FOR_OTHER") expense.forMemberId ?: "SHARED" else expense?.split ?: "SHARED")
    }
    var category by rememberSaveable { mutableStateOf(expense?.category ?: "OTHER") }
    var note by rememberSaveable { mutableStateOf(expense?.note ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    var pickingDate by remember { mutableStateOf(false) }
    val amountInvalid = stringResource(R.string.expenses_amount_invalid)
    val titleRequired = stringResource(R.string.expenses_title_required)
    val dateFormat = remember(locale) { DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale) }
    val validTarget = target == "SHARED" || target == "PERSONAL" || (target != paidBy && members.any { it.id == target })
    val safeTarget = if (validTarget) target else "SHARED"

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(
                    when {
                        settlement -> R.string.expenses_settlement
                        expense != null -> R.string.expenses_edit
                        else -> R.string.expenses_new
                    },
                ),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
            if (settlement && expense != null) {
                Text(
                    stringResource(
                        R.string.expenses_meta_settlement,
                        members.firstOrNull { it.id == expense.paidById }?.displayName.orEmpty(),
                        members.firstOrNull { it.id == expense.forMemberId }?.displayName.orEmpty(),
                    ) + " · " + Money.format(expense.amountCents, locale),
                    style = MaterialTheme.typography.bodyLarge,
                )
                OutlinedButton(onClick = { onDelete(expense.id) }, enabled = !saving, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.delete))
                }
                Spacer(Modifier.heightIn(min = 16.dp))
                return@Column
            }
            OutlinedTextField(
                value = amount,
                onValueChange = { amount = it; error = null },
                label = { Text(stringResource(R.string.expenses_amount)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = title,
                onValueChange = { title = it.take(120); error = null },
                label = { Text(stringResource(R.string.expenses_what)) },
                placeholder = { Text(stringResource(R.string.expenses_what_hint)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedButton(onClick = { pickingDate = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.expenses_date, LocalDate.parse(date).format(dateFormat)))
            }
            Text(stringResource(R.string.expenses_paid_by), style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                members.forEach { m -> FilterChip(selected = paidBy == m.id, onClick = { paidBy = m.id }, label = { Text(m.displayName) }) }
            }
            Text(stringResource(R.string.expenses_for_whom), style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = safeTarget == "SHARED", onClick = { target = "SHARED" }, label = { Text(stringResource(R.string.expenses_split_shared)) })
                members.filter { it.id != paidBy }.forEach { m ->
                    FilterChip(
                        selected = safeTarget == m.id,
                        onClick = { target = m.id },
                        label = { Text(stringResource(R.string.expenses_split_for, m.displayName)) },
                    )
                }
                FilterChip(selected = safeTarget == "PERSONAL", onClick = { target = "PERSONAL" }, label = { Text(stringResource(R.string.expenses_split_personal)) })
            }
            Text(
                stringResource(
                    when (safeTarget) {
                        "SHARED" -> R.string.expenses_hint_shared
                        "PERSONAL" -> R.string.expenses_hint_personal
                        else -> R.string.expenses_hint_for_other
                    },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(stringResource(R.string.expenses_category), style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Money.CATEGORY_EMOJI.forEach { (key, emoji) ->
                    FilterChip(selected = category == key, onClick = { category = key }, label = { Text("$emoji ${categoryLabel(key)}") })
                }
            }
            OutlinedTextField(
                value = note,
                onValueChange = { note = it.take(500) },
                label = { Text(stringResource(R.string.expenses_note)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (expense != null) {
                    TextButton(onClick = { onDelete(expense.id) }, enabled = !saving, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(stringResource(R.string.delete))
                    }
                }
                Spacer(Modifier.weight(1f))
                Button(
                    onClick = {
                        val cents = Money.parseCents(amount)
                        when {
                            cents == null -> error = amountInvalid
                            title.isBlank() -> error = titleRequired
                            else -> {
                                val split = if (safeTarget == "SHARED" || safeTarget == "PERSONAL") safeTarget else "FOR_OTHER"
                                onSave(
                                    ExpenseBody(
                                        paidById = paidBy,
                                        amountCents = cents,
                                        date = date,
                                        title = title.trim(),
                                        category = category,
                                        split = split,
                                        forMemberId = if (split == "FOR_OTHER") safeTarget else null,
                                        note = note.trim(),
                                    ),
                                )
                            }
                        }
                    },
                    enabled = !saving,
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.save)) }
            }
            Spacer(Modifier.heightIn(min = 16.dp))
        }
    }

    if (pickingDate) {
        val picker = rememberDatePickerState(
            initialSelectedDateMillis = LocalDate.parse(date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { pickingDate = false },
            confirmButton = {
                TextButton(onClick = {
                    picker.selectedDateMillis?.let {
                        date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()
                    }
                    pickingDate = false
                }) { Text(stringResource(R.string.ok)) }
            },
            dismissButton = { TextButton(onClick = { pickingDate = false }) { Text(stringResource(R.string.cancel)) } },
        ) { DatePicker(state = picker) }
    }
}
