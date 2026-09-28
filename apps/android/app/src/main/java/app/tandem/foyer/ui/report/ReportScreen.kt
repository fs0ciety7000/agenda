package app.tandem.foyer.ui.report

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.tandem.foyer.R
import app.tandem.foyer.data.REPORT_SCREENSHOT_MAX_BYTES
import app.tandem.foyer.data.ReportsRemote
import app.tandem.foyer.data.ReportsRemote.SendResult
import app.tandem.foyer.data.remote.CreateReportBody
import app.tandem.foyer.data.remote.ReportDiagnosticsDto
import app.tandem.foyer.data.remote.ReportDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

val REPORT_KINDS = listOf("BUG", "IDEA", "QUESTION", "OTHER")

data class ReportState(
    val mine: List<ReportDto> = emptyList(),
    val loading: Boolean = true,
    val offline: Boolean = false,
    val sending: Boolean = false,
    val diagnostics: ReportDiagnosticsDto? = null,
)

class ReportViewModel(private val remote: ReportsRemote, private val online: () -> Boolean) : ViewModel() {
    private val _state = MutableStateFlow(ReportState())
    val state: StateFlow<ReportState> = _state

    init {
        load()
        viewModelScope.launch { _state.update { it.copy(diagnostics = remote.diagnostics(online())) } }
    }

    fun load() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val mine = remote.mine()
            _state.update { it.copy(mine = mine.orEmpty(), loading = false, offline = mine == null) }
        }
    }

    fun send(body: CreateReportBody, screenshot: Pair<ByteArray, String>?, done: (SendResult) -> Unit) {
        _state.update { it.copy(sending = true) }
        viewModelScope.launch {
            val result = remote.send(body, screenshot)
            _state.update { it.copy(sending = false) }
            done(result)
            if (result == SendResult.Sent || result == SendResult.SentWithoutScreenshot) load()
        }
    }

    fun delete(id: String, done: (Boolean) -> Unit) {
        viewModelScope.launch {
            val ok = remote.delete(id)
            done(ok)
            if (ok) load()
        }
    }
}

/**
 * Signaler un problème, proposer une idée, poser une question. Informations techniques et contact
 * par e-mail : décochés par défaut ; ce qui serait envoyé est visible avant l'envoi.
 */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ReportScreen(
    vm: ReportViewModel,
    faqUrl: String,
    onBack: () -> Unit,
    onMessage: (String) -> Unit,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    var kind by rememberSaveable { mutableStateOf("BUG") }
    var title by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var withDiagnostics by rememberSaveable { mutableStateOf(false) }
    var allowContact by rememberSaveable { mutableStateOf(false) }
    var showDiagnostics by rememberSaveable { mutableStateOf(false) }
    var screenshot by remember { mutableStateOf<Pair<ByteArray, String>?>(null) }
    var toDelete by remember { mutableStateOf<ReportDto?>(null) }
    val msgSent = stringResource(R.string.report_sent)
    val msgNoShot = stringResource(R.string.report_sent_without_screenshot)
    val msgOffline = stringResource(R.string.report_offline)
    val msgTooMany = stringResource(R.string.report_too_many)
    val msgFailed = stringResource(R.string.report_failed)
    val msgTooBig = stringResource(R.string.report_screenshot_size)

    // Sélecteur de photos du système : aucune permission de stockage demandée.
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val type = context.contentResolver.getType(uri) ?: "image/jpeg"
            val bytes = withContext(Dispatchers.IO) {
                context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            }
            when {
                bytes == null -> onMessage(msgFailed)
                bytes.size > REPORT_SCREENSHOT_MAX_BYTES -> onMessage(msgTooBig)
                type !in listOf("image/png", "image/jpeg", "image/webp") -> onMessage(msgTooBig)
                else -> screenshot = bytes to type
            }
        }
    }

    val valid = title.trim().length >= 3 && description.trim().length >= 10

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.report_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.report_intro),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = { uriHandler.openUri(faqUrl) }) { Text(stringResource(R.string.report_faq)) }

            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                REPORT_KINDS.forEach { k ->
                    FilterChip(
                        selected = kind == k,
                        onClick = { kind = k },
                        label = { Text(kindLabel(k)) },
                    )
                }
            }
            OutlinedTextField(
                value = title,
                onValueChange = { title = it.take(120) },
                label = { Text(stringResource(R.string.report_field_title)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = description,
                onValueChange = { description = it.take(5000) },
                label = { Text(stringResource(R.string.report_field_description)) },
                supportingText = {
                    Text(stringResource(if (kind == "BUG") R.string.report_description_hint_bug else R.string.report_description_hint))
                },
                minLines = 4,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth(),
            )

            Text(stringResource(R.string.report_screenshot), style = MaterialTheme.typography.titleSmall)
            if (screenshot == null) {
                OutlinedButton(
                    onClick = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.report_screenshot_add)) }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.report_screenshot_added), modifier = Modifier.weight(1f))
                    IconButton(onClick = { screenshot = null }) {
                        Icon(Icons.Default.Close, contentDescription = stringResource(R.string.report_screenshot_remove))
                    }
                }
            }
            Text(
                stringResource(R.string.report_screenshot_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            OutlinedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    CheckRow(
                        checked = withDiagnostics,
                        onChange = { withDiagnostics = it },
                        label = stringResource(R.string.report_diagnostics),
                        hint = stringResource(R.string.report_diagnostics_hint),
                    )
                    TextButton(onClick = { showDiagnostics = !showDiagnostics }) {
                        Text(stringResource(if (showDiagnostics) R.string.report_diagnostics_hide else R.string.report_diagnostics_show))
                    }
                    val d = state.diagnostics
                    if (showDiagnostics && d != null) DiagnosticsList(d)
                    CheckRow(
                        checked = allowContact,
                        onChange = { allowContact = it },
                        label = stringResource(R.string.report_contact),
                        hint = stringResource(R.string.report_contact_hint),
                    )
                }
            }
            Text(
                stringResource(R.string.report_privacy),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                onClick = {
                    vm.send(
                        CreateReportBody(
                            kind = kind,
                            title = title.trim(),
                            description = description.trim(),
                            allowContact = allowContact,
                            diagnostics = if (withDiagnostics) state.diagnostics else null,
                        ),
                        screenshot,
                    ) { result ->
                        when (result) {
                            SendResult.Sent, SendResult.SentWithoutScreenshot -> {
                                onMessage(if (result == SendResult.Sent) msgSent else msgNoShot)
                                title = ""
                                description = ""
                                screenshot = null
                            }
                            SendResult.Offline -> onMessage(msgOffline)
                            SendResult.TooMany -> onMessage(msgTooMany)
                            SendResult.Failed -> onMessage(msgFailed)
                        }
                    }
                },
                enabled = valid && !state.sending,
                modifier = Modifier.heightIn(min = 48.dp),
            ) { Text(stringResource(R.string.report_send)) }

            if (state.mine.isNotEmpty()) {
                Text(
                    stringResource(R.string.report_mine),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 12.dp),
                )
                state.mine.forEach { r ->
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(start = 16.dp, top = 8.dp, bottom = 12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(r.title, style = MaterialTheme.typography.bodyLarge)
                                    Text(
                                        "${kindLabel(r.kind)} · ${statusLabel(r.status)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                IconButton(onClick = { toDelete = r }) {
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = stringResource(R.string.report_withdraw, r.title),
                                    )
                                }
                            }
                            r.reply?.let {
                                Text(
                                    stringResource(R.string.report_reply),
                                    style = MaterialTheme.typography.labelMedium,
                                    modifier = Modifier.padding(top = 8.dp, end = 16.dp),
                                )
                                Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(end = 16.dp))
                            }
                        }
                    }
                }
                Text(
                    stringResource(R.string.report_retention),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (state.offline) {
                Text(stringResource(R.string.report_list_offline))
                OutlinedButton(onClick = vm::load) { Text(stringResource(R.string.retry)) }
            }
        }
    }

    toDelete?.let { r ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            text = { Text(stringResource(R.string.report_withdraw_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    toDelete = null
                    vm.delete(r.id) { ok -> if (!ok) onMessage(msgFailed) }
                }) { Text(stringResource(R.string.report_withdraw_action)) }
            },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text(stringResource(R.string.cancel)) } },
        )
    }
    LaunchedEffect(Unit) { vm.load() }
}

@Composable
private fun CheckRow(checked: Boolean, onChange: (Boolean) -> Unit, label: String, hint: String) {
    Row(
        Modifier.fillMaxWidth().toggleable(value = checked, role = Role.Checkbox, onValueChange = onChange),
        verticalAlignment = Alignment.Top,
    ) {
        Checkbox(checked = checked, onCheckedChange = null, modifier = Modifier.padding(12.dp))
        Column(Modifier.padding(top = 10.dp)) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DiagnosticsList(d: ReportDiagnosticsDto) {
    val yes = stringResource(R.string.report_yes)
    val no = stringResource(R.string.report_no)
    val rows = listOf(
        R.string.report_diag_platform to d.platform,
        R.string.report_diag_version to d.appVersion,
        R.string.report_diag_os to d.os,
        R.string.report_diag_device to d.device,
        R.string.report_diag_locale to d.locale,
        R.string.report_diag_timezone to d.timezone,
        R.string.report_diag_screen to d.screen,
        R.string.report_diag_page to d.page,
        R.string.report_diag_online to d.online?.let { if (it) yes else no },
        R.string.report_diag_pending to d.pendingChanges?.toString(),
    )
    Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.padding(start = 12.dp)) {
        rows.forEach { (label, value) ->
            Text(
                "${stringResource(label)} : ${value ?: "—"}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun kindLabel(kind: String): String = stringResource(
    when (kind) {
        "BUG" -> R.string.report_kind_bug
        "IDEA" -> R.string.report_kind_idea
        "QUESTION" -> R.string.report_kind_question
        else -> R.string.report_kind_other
    },
)

@Composable
private fun statusLabel(status: String): String = stringResource(
    when (status) {
        "IN_PROGRESS" -> R.string.report_status_in_progress
        "RESOLVED" -> R.string.report_status_resolved
        "CLOSED" -> R.string.report_status_closed
        else -> R.string.report_status_open
    },
)
