package app.tandem.foyer.ui.settings

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.data.PasskeyAdd
import app.tandem.foyer.data.remote.PasskeyDto
import app.tandem.foyer.domain.repository.PasskeyOutcome
import app.tandem.foyer.ui.components.currentLocale
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * Réglages → Compte → Passkeys : celles du compte (créées ici ou sur le site), ajout sur ce
 * téléphone par le Credential Manager, suppression. En ligne ; sans Credential Manager (Android 8)
 * ou sans certificats déclarés sur le serveur, la liste reste, l'ajout renvoie au site.
 */
@Composable
fun PasskeysSection(
    online: Boolean,
    list: suspend () -> List<PasskeyDto>?,
    available: suspend () -> Boolean,
    add: suspend (create: suspend (optionsJson: String) -> PasskeyOutcome) -> PasskeyAdd,
    remove: suspend (id: String) -> Boolean,
    /** Credential Manager du téléphone (null : ajout impossible ici). */
    create: (suspend (Context, String) -> PasskeyOutcome)?,
    onMessage: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var passkeys by remember { mutableStateOf<List<PasskeyDto>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var canAdd by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var confirm by remember { mutableStateOf<PasskeyDto?>(null) }
    LaunchedEffect(online, reload) {
        if (!online) {
            failed = passkeys == null
            return@LaunchedEffect
        }
        val loaded = list()
        failed = loaded == null
        if (loaded != null) passkeys = loaded
        canAdd = create != null && available()
    }
    val offline = stringResource(R.string.passkeys_offline)
    val added = stringResource(R.string.passkeys_added)
    val already = stringResource(R.string.passkeys_already_here)
    val error = stringResource(R.string.passkeys_error)
    val removed = stringResource(R.string.passkeys_removed)

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            stringResource(R.string.passkeys_title),
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            stringResource(R.string.passkeys_intro),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        val items = passkeys
        when {
            items == null && failed -> {
                Text(
                    offline,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = { reload++ }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.retry))
                }
            }
            items == null -> Text(
                stringResource(R.string.passkeys_loading),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            items.isEmpty() -> Text(
                stringResource(R.string.passkeys_none),
                style = MaterialTheme.typography.bodyMedium,
            )
            else -> items.forEachIndexed { i, p ->
                if (i > 0) HorizontalDivider()
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(p.name, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            passkeyMeta(p),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    val description = stringResource(R.string.passkeys_remove, p.name)
                    TextButton(
                        onClick = { if (online) confirm = p else onMessage(offline) },
                        modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = description },
                    ) { Text(stringResource(R.string.delete)) }
                }
            }
        }
        if (canAdd && create != null) {
            OutlinedButton(
                onClick = {
                    if (!online) {
                        onMessage(offline)
                        return@OutlinedButton
                    }
                    busy = true
                    scope.launch {
                        val result = add { options -> create(context, options) }
                        busy = false
                        when (result) {
                            PasskeyAdd.ADDED -> {
                                onMessage(added)
                                reload++
                            }
                            PasskeyAdd.ALREADY_HERE -> onMessage(already)
                            PasskeyAdd.FAILED -> onMessage(error)
                            PasskeyAdd.OFFLINE -> onMessage(offline)
                            PasskeyAdd.CANCELLED -> Unit
                        }
                    }
                },
                enabled = !busy,
                modifier = Modifier.padding(top = 4.dp).heightIn(min = 48.dp),
            ) { Text(stringResource(R.string.passkeys_add)) }
        } else if (passkeys != null) {
            Text(
                stringResource(R.string.passkeys_add_on_site),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    confirm?.let { p ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            text = { Text(stringResource(R.string.passkeys_confirm_remove)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirm = null
                        scope.launch {
                            if (remove(p.id)) {
                                passkeys = passkeys?.filterNot { it.id == p.id }
                                onMessage(removed)
                            } else {
                                onMessage(offline)
                            }
                        }
                    },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.delete), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirm = null }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

/** « Ajoutée le 9 oct. 2026 · Utilisée le 10 oct. 2026 · synchronisée ». */
@Composable
private fun passkeyMeta(p: PasskeyDto): String {
    val format = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(currentLocale())
    fun day(iso: String) = runCatching { format.format(Instant.parse(iso).atZone(ZoneId.systemDefault())) }.getOrNull()
    return listOfNotNull(
        day(p.createdAt)?.let { stringResource(R.string.passkeys_created, it) },
        p.lastUsedAt?.let(::day)?.let { stringResource(R.string.passkeys_last_used, it) },
        if (p.synced) stringResource(R.string.passkeys_synced) else null,
    ).joinToString(" · ")
}
