package app.tandem.foyer.ui.settings

import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.ui.notes.rememberDeviceUnlock
import kotlinx.coroutines.launch
import java.io.OutputStream
import java.time.LocalDate

/** Nom proposé pour le fichier, daté du jour (comme sur le site). */
fun backupFilename(day: LocalDate = LocalDate.now()) = "tandem-foyer-$day.zip"

/**
 * Sauvegarde du foyer : une archive .zip de tout le foyer, enregistrée là où l'utilisateur le
 * choisit (Fichiers, Drive…). Elle contient le texte des notes sensibles : empreinte, visage ou
 * code du téléphone d'abord, comme pour les afficher.
 */
@Composable
fun BackupSection(
    online: Boolean,
    download: suspend (open: () -> OutputStream?) -> Boolean,
    onMessage: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val offline = stringResource(R.string.backup_offline)
    val done = stringResource(R.string.backup_done)
    val failed = stringResource(R.string.backup_failed)
    val unlock = rememberDeviceUnlock(
        stringResource(R.string.backup_unlock_title),
        stringResource(R.string.backup_unlock_subtitle),
    )
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            val ok = download { context.contentResolver.openOutputStream(uri, "wt") }
            busy = false
            if (ok) {
                onMessage(done)
            } else {
                // Fichier vide laissé par le sélecteur : on l'enlève (sans insister si refusé).
                runCatching { DocumentsContract.deleteDocument(context.contentResolver, uri) }
                onMessage(failed)
            }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            stringResource(R.string.backup_title),
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.semantics { heading() },
        )
        Text(stringResource(R.string.backup_intro), style = MaterialTheme.typography.bodyMedium)
        Text(
            stringResource(R.string.backup_excluded),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton(
            onClick = {
                if (!online) onMessage(offline) else unlock { save.launch(backupFilename()) }
            },
            enabled = !busy,
            modifier = Modifier.heightIn(min = 48.dp),
        ) {
            Text(stringResource(if (busy) R.string.backup_preparing else R.string.backup_download))
        }
        Text(
            stringResource(R.string.backup_private),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
