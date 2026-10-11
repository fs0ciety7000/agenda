package app.tandem.foyer.ui.settings

import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.ui.notes.rememberDeviceUnlock
import kotlinx.coroutines.launch
import java.io.OutputStream
import java.time.LocalDate

/** Nom proposé pour le fichier, daté du jour (comme sur le site) : `.tandem` s'il est chiffré. */
fun backupFilename(day: LocalDate = LocalDate.now(), encrypted: Boolean = false) =
    "tandem-foyer-$day.${if (encrypted) "tandem" else "zip"}"

/** Longueur minimale de la phrase de passe (comme l'API). */
const val BACKUP_PASSPHRASE_MIN = 10

/**
 * Sauvegarde du foyer : une archive .zip de tout le foyer, enregistrée là où l'utilisateur le
 * choisit (Fichiers, Drive…). Elle contient le texte des notes sensibles : empreinte, visage ou
 * code du téléphone d'abord, comme pour les afficher.
 */
@Composable
fun BackupSection(
    online: Boolean,
    /** Phrase de passe (null : archive .zip en clair), puis le fichier à remplir. */
    download: suspend (passphrase: String?, open: () -> OutputStream?) -> Boolean,
    onMessage: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    // Chiffrement facultatif : phrase tapée deux fois, jamais gardée (ni ici, ni sur le serveur).
    var encrypt by rememberSaveable { mutableStateOf(false) }
    var passphrase by remember { mutableStateOf("") }
    var again by remember { mutableStateOf("") }
    val ready = !encrypt || (passphrase.length >= BACKUP_PASSPHRASE_MIN && again == passphrase)
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
            val ok = download(passphrase.takeIf { encrypt }) { context.contentResolver.openOutputStream(uri, "wt") }
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
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                value = encrypt,
                role = Role.Switch,
                onValueChange = { encrypt = it },
            ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.backup_encrypt), style = MaterialTheme.typography.bodyMedium)
                Text(
                    stringResource(R.string.backup_encrypt_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = encrypt, onCheckedChange = null)
        }
        if (encrypt) {
            OutlinedTextField(
                value = passphrase,
                onValueChange = { passphrase = it },
                label = { Text(stringResource(R.string.backup_passphrase)) },
                supportingText = {
                    Text(pluralStringResource(R.plurals.backup_passphrase_hint, BACKUP_PASSPHRASE_MIN, BACKUP_PASSPHRASE_MIN))
                },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            val mismatch = again.isNotEmpty() && again != passphrase
            OutlinedTextField(
                value = again,
                onValueChange = { again = it },
                label = { Text(stringResource(R.string.backup_passphrase_again)) },
                isError = mismatch,
                supportingText = if (mismatch) {
                    { Text(stringResource(R.string.backup_passphrase_mismatch)) }
                } else {
                    null
                },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        OutlinedButton(
            onClick = {
                if (!online) onMessage(offline) else unlock { save.launch(backupFilename(encrypted = encrypt)) }
            },
            enabled = !busy && ready,
            modifier = Modifier.heightIn(min = 48.dp),
        ) {
            Text(stringResource(if (busy) R.string.backup_preparing else R.string.backup_download))
        }
        Text(
            stringResource(if (encrypt) R.string.backup_private_encrypted else R.string.backup_private),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
