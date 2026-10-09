package app.tandem.foyer.ui.shopping

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import app.tandem.foyer.R
import app.tandem.foyer.data.remote.BarcodeLookupDto
import app.tandem.foyer.domain.Barcodes
import app.tandem.foyer.ui.expenses.ReceiptPhoto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Ce qui s'affiche sous les boutons de photo quand rien n'a été trouvé. */
enum class BarcodeNote { NOT_READ, FAILED }

/**
 * Étapes d'un ajout par code-barres, sans interface (testée seule) : chiffres vérifiés avant
 * toute requête, résultat affiché, nom donné ou corrigé retenu pour le foyer.
 */
class BarcodeFlow(
    private val lookup: suspend (code: String) -> BarcodeLookupDto?,
    private val rememberName: suspend (code: String, name: String) -> Boolean,
) {
    var code by mutableStateOf("")
    var codeInvalid by mutableStateOf(false)
    var note by mutableStateOf<BarcodeNote?>(null)
    var result by mutableStateOf<BarcodeLookupDto?>(null)
    var name by mutableStateOf("")
    var busy by mutableStateOf(false)

    fun reset() {
        code = ""
        codeInvalid = false
        note = null
        result = null
        name = ""
        busy = false
    }

    /** Résultat d'une lecture ou d'une recherche (null : le serveur n'a pas répondu). */
    fun show(r: BarcodeLookupDto?) {
        busy = false
        when {
            r == null -> note = BarcodeNote.FAILED
            r.barcode == null -> note = BarcodeNote.NOT_READ
            else -> {
                note = null
                result = r
                name = r.name.orEmpty()
            }
        }
    }

    /** Chiffres tapés : refusés s'ils sont faux (aucune requête), sinon cherchés. */
    suspend fun search() {
        val digits = Barcodes.normalize(code)
        codeInvalid = !Barcodes.isValid(digits)
        if (codeInvalid) return
        busy = true
        note = null
        show(lookup(digits))
    }

    /** Nom à ajouter ; un nom donné ou corrigé est d'abord retenu pour le foyer. */
    suspend fun confirm(): String? {
        val code = result?.barcode ?: return null
        val trimmed = name.trim().takeIf { it.isNotEmpty() } ?: return null
        if (trimmed != result?.name) rememberName(code, trimmed)
        return trimmed
    }
}

/**
 * Ajouter un article par son code-barres : photo lue sur le serveur (ou chiffres tapés), nom
 * proposé (mémoire du foyer, sinon Open Food Facts), modifiable ; un nom donné ou corrigé est
 * retenu pour le foyer. En ligne seulement.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BarcodeButton(
    online: Boolean,
    scan: suspend (jpeg: ByteArray) -> BarcodeLookupDto?,
    lookup: suspend (code: String) -> BarcodeLookupDto?,
    rememberName: suspend (code: String, name: String) -> Boolean,
    onAdd: (name: String) -> Unit,
    onMessage: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var open by rememberSaveable { mutableStateOf(false) }
    val flow = remember { BarcodeFlow(lookup, rememberName) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    val offline = stringResource(R.string.barcode_offline)
    val addedFmt = stringResource(R.string.barcode_added)
    val runScan: (Uri) -> Unit = { uri ->
        flow.busy = true
        flow.note = null
        scope.launch {
            val jpeg = withContext(Dispatchers.IO) { ReceiptPhoto.toJpeg(context, uri) }
            flow.show(jpeg?.let { scan(it) })
        }
    }
    val takePhoto = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = cameraUri
        if (ok && uri != null) runScan(uri)
    }
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runScan(uri)
    }
    val search: () -> Unit = { scope.launch { flow.search() } }

    OutlinedButton(
        onClick = { if (online) open = true else onMessage(offline) },
        modifier = Modifier.heightIn(min = 48.dp),
    ) {
        Icon(painterResource(R.drawable.ic_scan_barcode), contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(stringResource(R.string.barcode_open))
    }
    if (!open) return

    val found = flow.result?.barcode
    val busy = flow.busy
    val close: () -> Unit = {
        open = false
        flow.reset()
    }
    AlertDialog(
        onDismissRequest = close,
        title = { Text(stringResource(R.string.barcode_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (found == null) {
                    Text(stringResource(R.string.barcode_intro), style = MaterialTheme.typography.bodyMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                val dir = java.io.File(context.cacheDir, "camera").apply { mkdirs() }
                                val file = java.io.File(dir, "barcode-${System.currentTimeMillis()}.jpg")
                                val uri = FileProvider.getUriForFile(context, "${context.packageName}.attachments", file)
                                cameraUri = uri
                                try {
                                    takePhoto.launch(uri)
                                } catch (_: ActivityNotFoundException) {
                                    pickPhoto.launch(arrayOf("image/*"))
                                }
                            },
                            enabled = !busy,
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) {
                            Text(stringResource(if (busy) R.string.barcode_reading else R.string.barcode_photo))
                        }
                        TextButton(onClick = { pickPhoto.launch(arrayOf("image/*")) }, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.barcode_pick))
                        }
                    }
                    flow.note?.let {
                        Text(
                            stringResource(if (it == BarcodeNote.NOT_READ) R.string.barcode_not_read else R.string.barcode_failed),
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    }
                    OutlinedTextField(
                        value = flow.code,
                        onValueChange = { flow.code = it.take(20) },
                        label = { Text(stringResource(R.string.barcode_code)) },
                        isError = flow.codeInvalid,
                        supportingText = if (flow.codeInvalid) {
                            { Text(stringResource(R.string.barcode_invalid)) }
                        } else {
                            null
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { search() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedButton(onClick = search, enabled = !busy && flow.code.isNotBlank(), modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(stringResource(R.string.barcode_search))
                    }
                } else {
                    Text(
                        stringResource(R.string.barcode_code_label, found),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = flow.name,
                        onValueChange = { flow.name = it.take(200) },
                        label = { Text(stringResource(R.string.barcode_name)) },
                        supportingText = {
                            Text(
                                stringResource(
                                    when (flow.result?.source) {
                                        "HOUSEHOLD" -> R.string.barcode_from_household
                                        "OPEN_FOOD_FACTS" -> R.string.barcode_from_off
                                        else -> R.string.barcode_unknown
                                    },
                                ),
                            )
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            if (found != null) {
                Button(
                    onClick = {
                        scope.launch {
                            val added = flow.confirm() ?: return@launch
                            onAdd(added)
                            onMessage(addedFmt.format(added))
                            close()
                        }
                    },
                    enabled = flow.name.isNotBlank(),
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.barcode_add)) }
            }
        },
        dismissButton = {
            if (found != null) {
                TextButton(onClick = flow::reset, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.barcode_again)) }
            } else {
                TextButton(onClick = close, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.close)) }
            }
        },
    )
}
