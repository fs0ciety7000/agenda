package app.tandem.foyer.ui.settings

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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.data.DevicesRemote
import app.tandem.foyer.data.remote.DeviceSessionDto
import app.tandem.foyer.ui.taskform.relativeTime
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Réglages → Compte : appareils où le compte est connecté, dernière activité, et déconnexion à
 * distance (téléphone perdu, ordinateur partagé). Demande une connexion.
 */
@Composable
fun DeviceSessions(remote: DevicesRemote, onMessage: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var sessions by remember { mutableStateOf<List<DeviceSessionDto>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }
    var confirmOthers by remember { mutableStateOf(false) }
    LaunchedEffect(reload) {
        val list = remote.list()
        failed = list == null
        if (list != null) sessions = list
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            stringResource(R.string.devices_title),
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            stringResource(R.string.devices_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        val list = sessions
        when {
            list == null && failed -> {
                Text(
                    stringResource(R.string.devices_offline),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = { reload++ }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.retry))
                }
            }
            list == null -> Text(
                stringResource(R.string.devices_loading),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> list.forEachIndexed { i, d ->
                if (i > 0) HorizontalDivider()
                val name = deviceLabel(d)
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            if (d.current) "$name · ${stringResource(R.string.devices_current)}" else name,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            stringResource(R.string.devices_activity, at(d.lastUsedAt), at(d.createdAt)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!d.current) {
                        val description = stringResource(R.string.devices_revoke_one, name)
                        val revoked = stringResource(R.string.devices_revoked, name)
                        val offline = stringResource(R.string.devices_offline)
                        TextButton(
                            onClick = {
                                scope.launch {
                                    if (remote.revoke(d.id)) {
                                        sessions = sessions?.filterNot { it.id == d.id }
                                        onMessage(revoked)
                                    } else {
                                        onMessage(offline)
                                    }
                                }
                            },
                            modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = description },
                        ) { Text(stringResource(R.string.devices_revoke)) }
                    }
                }
            }
        }
        val others = sessions.orEmpty().count { !it.current }
        if (others > 1) {
            OutlinedButton(onClick = { confirmOthers = true }, modifier = Modifier.padding(top = 4.dp).heightIn(min = 48.dp)) {
                Text(stringResource(R.string.devices_revoke_others))
            }
        }
        if (confirmOthers) {
            val revokedOthers = pluralStringResource(R.plurals.devices_revoked_others, others, others)
            val offline = stringResource(R.string.devices_offline)
            AlertDialog(
                onDismissRequest = { confirmOthers = false },
                title = { Text(pluralStringResource(R.plurals.devices_revoke_others_title, others, others)) },
                text = { Text(stringResource(R.string.devices_revoke_others_body)) },
                confirmButton = {
                    TextButton(onClick = {
                        confirmOthers = false
                        scope.launch {
                            if (remote.revokeOthers()) {
                                sessions = sessions?.filter { it.current }
                                onMessage(revokedOthers)
                            } else {
                                onMessage(offline)
                            }
                        }
                    }) { Text(stringResource(R.string.devices_revoke_others), color = MaterialTheme.colorScheme.error) }
                },
                dismissButton = { TextButton(onClick = { confirmOthers = false }) { Text(stringResource(R.string.cancel)) } },
            )
        }
    }
}

/** « App Android · Android 14 », « Chrome · Windows ». */
@Composable
private fun deviceLabel(d: DeviceSessionDto): String {
    val first = if (d.kind == "ANDROID_APP") stringResource(R.string.devices_android_app) else d.browser ?: stringResource(R.string.devices_unknown)
    return listOfNotNull(first, d.os).joinToString(" · ")
}

private fun at(iso: String): String = runCatching { relativeTime(Instant.parse(iso)) }.getOrDefault("")
