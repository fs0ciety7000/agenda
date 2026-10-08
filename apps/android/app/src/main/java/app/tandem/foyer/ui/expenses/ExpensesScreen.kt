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
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Checkbox
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import app.tandem.foyer.data.ExpensesRemote
import app.tandem.foyer.data.remote.ExpenseShareDto
import app.tandem.foyer.data.remote.RecurringExpenseBody
import app.tandem.foyer.data.remote.RecurringExpenseDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
    val recurring: List<RecurringExpenseDto> = emptyList(),
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
                    items = result?.items ?: it.items,
                    summary = result?.summary ?: it.summary,
                    recurring = result?.recurring ?: it.recurring,
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

    /** Enregistre, puis joint le ticket choisi (lu par [readReceipt]) s'il y en a un. */
    fun save(
        editingId: String?,
        body: ExpenseBody,
        receipt: (suspend () -> Triple<String, String, ByteArray>?)?,
        done: (Boolean) -> Unit,
    ) = perform(done) {
        val saved = remote.save(editingId, body) ?: return@perform false
        val file = receipt?.invoke() ?: return@perform true
        remote.uploadReceipt(saved.id, file.first, file.second, file.third)
    }

    fun createRecurring(body: RecurringExpenseBody, done: (Boolean) -> Unit) = perform(done) { remote.createRecurring(body) }

    fun stopRecurring(id: String, done: (Boolean) -> Unit) = perform(done) { remote.stopRecurring(id) }

    fun deleteReceipt(id: String, done: (Boolean) -> Unit) = perform(done) { remote.deleteReceipt(id) }

    suspend fun downloadReceipt(id: String) = remote.downloadReceipt(id)

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

/** Ce qu'édite la feuille : null = fermée ; expense null = nouvelle dépense (préremplie ou non). */
private data class Editing(val expense: ExpenseDto?, val title: String? = null, val category: String? = null)

/** Dépenses du foyer : qui a payé quoi, la part de chacun, et qui doit combien à qui. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpensesScreen(
    vm: ExpensesViewModel,
    members: List<Member>,
    myMemberId: String?,
    onBack: () -> Unit,
    onMessage: (String) -> Unit,
    /** Ouvert depuis « Noter la dépense » (Courses) : formulaire prérempli. */
    prefillTitle: String? = null,
    prefillCategory: String? = null,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val locale = currentLocale()
    val money = { cents: Long -> Money.format(cents, locale) }
    val former = stringResource(R.string.history_former_member)
    val name = { id: String? -> members.firstOrNull { it.id == id }?.displayName ?: former }
    val dayFormat = remember(locale) { DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL).withLocale(locale) }
    var editing by remember { mutableStateOf<Editing?>(null) }
    LaunchedEffect(prefillTitle, prefillCategory) {
        if (prefillTitle != null || prefillCategory != null) editing = Editing(null, prefillTitle, prefillCategory)
    }
    val failed = stringResource(R.string.expenses_failed)
    val noApp = stringResource(R.string.attachment_no_app)
    // Ticket : téléchargé puis ouvert par l'app adaptée (galerie, lecteur PDF).
    val openReceipt: (String) -> Unit = { id ->
        scope.launch {
            val (file, type) = vm.downloadReceipt(id) ?: return@launch onMessage(failed)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.attachments", file)
            try {
                context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            } catch (_: ActivityNotFoundException) {
                onMessage(noApp)
            }
        }
    }
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
            if (state.recurring.isNotEmpty()) {
                item(key = "recurring") {
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                stringResource(R.string.expenses_recurring_title),
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.semantics { heading() },
                            )
                            state.recurring.forEach { r ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text("${Money.CATEGORY_EMOJI[r.category] ?: "📦"} ${r.title} · ${money(r.amountCents)}", style = MaterialTheme.typography.bodyLarge)
                                        Text(
                                            stringResource(R.string.expenses_recurring_line, r.dayOfMonth, name(r.paidById)),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    TextButton(
                                        onClick = { vm.stopRecurring(r.id) { ok -> if (!ok) onMessage(failed) } },
                                        enabled = !state.saving,
                                        modifier = Modifier.heightIn(min = 48.dp),
                                    ) { Text(stringResource(R.string.expenses_recurring_stop)) }
                                }
                            }
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
            prefillTitle = current.title,
            prefillCategory = current.category,
            members = members,
            defaultPayer = myMemberId ?: members.firstOrNull()?.id.orEmpty(),
            saving = state.saving,
            onDismiss = { editing = null },
            onSave = { body, receiptUri ->
                val receipt: (suspend () -> Triple<String, String, ByteArray>?)? = receiptUri?.let { uri ->
                    {
                        withContext(Dispatchers.IO) {
                            runCatching {
                                val type = context.contentResolver.getType(uri) ?: "image/jpeg"
                                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                                bytes?.let { Triple(if (type == "application/pdf") "ticket.pdf" else "ticket.jpg", type, it) }
                            }.getOrNull()
                        }
                    }
                }
                vm.save(current.expense?.id, body, receipt) { ok ->
                    if (ok) editing = null else onMessage(failed)
                }
            },
            onSaveRecurring = { body ->
                vm.createRecurring(body) { ok -> if (ok) editing = null else onMessage(failed) }
            },
            onOpenReceipt = openReceipt,
            onDeleteReceipt = { id -> vm.deleteReceipt(id) { ok -> if (ok) editing = null else onMessage(failed) } },
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
                        e.split == "CUSTOM" -> stringResource(R.string.expenses_meta_custom, name(e.paidById))
                        else -> stringResource(R.string.expenses_meta_shared, name(e.paidById))
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (e.recurringId != null || e.hasReceipt) {
                    Text(
                        listOfNotNull(
                            if (e.recurringId != null) "↻ " + stringResource(R.string.expenses_monthly) else null,
                            if (e.hasReceipt) "📎 " + stringResource(R.string.expenses_receipt) else null,
                        ).joinToString("  "),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
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
    prefillTitle: String?,
    prefillCategory: String?,
    members: List<Member>,
    defaultPayer: String,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (ExpenseBody, Uri?) -> Unit,
    onSaveRecurring: (RecurringExpenseBody) -> Unit,
    onOpenReceipt: (String) -> Unit,
    onDeleteReceipt: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    val locale = currentLocale()
    val settlement = expense?.kind == "SETTLEMENT"
    var amount by rememberSaveable { mutableStateOf(expense?.let { Money.editable(it.amountCents, locale) } ?: "") }
    var title by rememberSaveable { mutableStateOf(expense?.title ?: prefillTitle ?: "") }
    var date by rememberSaveable { mutableStateOf(expense?.date ?: LocalDate.now().toString()) }
    var paidBy by rememberSaveable { mutableStateOf(expense?.paidById ?: defaultPayer) }
    // « SHARED », « PERSONAL » ou l'identifiant du membre pour qui la dépense a été avancée.
    var target by rememberSaveable {
        mutableStateOf(if (expense?.split == "FOR_OTHER") expense.forMemberId ?: "SHARED" else expense?.split ?: "SHARED")
    }
    var category by rememberSaveable { mutableStateOf(expense?.category ?: prefillCategory ?: "OTHER") }
    // Parts à la main (« CUSTOM »), en texte par membre.
    var custom by remember {
        mutableStateOf(
            members.associate { m ->
                m.id to (expense?.takeIf { it.split == "CUSTOM" }?.shares?.firstOrNull { it.memberId == m.id }
                    ?.let { Money.editable(it.amountCents, locale) } ?: "")
            },
        )
    }
    var monthly by rememberSaveable { mutableStateOf(false) }
    var receiptUri by remember { mutableStateOf<Uri?>(null) }
    val pickReceipt = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) receiptUri = uri }
    var note by rememberSaveable { mutableStateOf(expense?.note ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    var pickingDate by remember { mutableStateOf(false) }
    val amountInvalid = stringResource(R.string.expenses_amount_invalid)
    val titleRequired = stringResource(R.string.expenses_title_required)
    val dateFormat = remember(locale) { DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale) }
    val customInvalid = stringResource(R.string.expenses_custom_invalid)
    val validTarget = target == "SHARED" || target == "CUSTOM" || target == "PERSONAL" ||
        (target != paidBy && members.any { it.id == target })
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
                FilterChip(selected = safeTarget == "CUSTOM", onClick = { target = "CUSTOM" }, label = { Text(stringResource(R.string.expenses_split_custom)) })
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
                        "CUSTOM" -> R.string.expenses_hint_custom
                        "PERSONAL" -> R.string.expenses_hint_personal
                        else -> R.string.expenses_hint_for_other
                    },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val totalCents = Money.parseCents(amount) ?: 0L
            val customCents = members.map { m -> custom[m.id].orEmpty().trim().let { if (it.isEmpty()) 0L else Money.parseCents(it) } }
            val customLeft = totalCents - customCents.sumOf { it ?: 0L }
            if (safeTarget == "CUSTOM") {
                members.forEach { m ->
                    OutlinedTextField(
                        value = custom[m.id].orEmpty(),
                        onValueChange = { v -> custom = custom + (m.id to v) },
                        label = { Text(stringResource(R.string.expenses_custom_share, m.displayName)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Text(
                    if (customLeft == 0L) "✓ " + stringResource(R.string.expenses_custom_ok)
                    else stringResource(R.string.expenses_custom_left, Money.format(customLeft, locale)),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (customLeft == 0L) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
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
            val canRepeat = expense == null && safeTarget != "CUSTOM"
            if (canRepeat) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { monthly = !monthly },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = monthly, onCheckedChange = null)
                    Column(Modifier.padding(start = 8.dp)) {
                        Text(stringResource(R.string.expenses_monthly))
                        Text(
                            stringResource(R.string.expenses_monthly_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (!(canRepeat && monthly)) {
                Text(stringResource(R.string.expenses_receipt), style = MaterialTheme.typography.titleSmall)
                if (expense?.hasReceipt == true) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { onOpenReceipt(expense.id) }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.expenses_receipt_open))
                        }
                        TextButton(onClick = { onDeleteReceipt(expense.id) }, enabled = !saving, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.expenses_receipt_remove))
                        }
                    }
                } else {
                    OutlinedButton(
                        onClick = { pickReceipt.launch(arrayOf("image/*", "application/pdf")) },
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) {
                        Text(
                            if (receiptUri != null) "✓ " + stringResource(R.string.expenses_receipt_chosen)
                            else stringResource(R.string.expenses_receipt_add),
                        )
                    }
                }
            }
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
                            safeTarget == "CUSTOM" && (customCents.any { it == null } || customLeft != 0L) ->
                                error = customInvalid.format(Money.format(cents, locale))
                            else -> {
                                val split = if (safeTarget in listOf("SHARED", "CUSTOM", "PERSONAL")) safeTarget else "FOR_OTHER"
                                if (canRepeat && monthly) {
                                    onSaveRecurring(
                                        RecurringExpenseBody(
                                            paidById = paidBy,
                                            amountCents = cents,
                                            title = title.trim(),
                                            category = category,
                                            split = split,
                                            forMemberId = if (split == "FOR_OTHER") safeTarget else null,
                                            note = note.trim(),
                                            startDate = date,
                                        ),
                                    )
                                } else {
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
                                            shares = if (split == "CUSTOM") {
                                                members.mapIndexed { i, m -> ExpenseShareDto(m.id, customCents[i] ?: 0L) }
                                            } else null,
                                        ),
                                        receiptUri,
                                    )
                                }
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
