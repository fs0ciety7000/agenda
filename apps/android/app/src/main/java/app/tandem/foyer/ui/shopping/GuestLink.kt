package app.tandem.foyer.ui.shopping

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.data.remote.GuestShoppingLinkDto
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.ui.components.currentLocale
import app.tandem.foyer.ui.theme.Tokens
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * Lien invité vers la liste de courses (baby-sitter, quelqu'un qui garde la maison) : lecture
 * seule, sans compte, un par foyer. Créer, envoyer, copier, remplacer ou couper ; en ligne.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GuestLinkButton(
    online: Boolean,
    householdName: String,
    members: Map<String, Member>,
    load: suspend () -> GuestShoppingLinkDto?,
    /** Crée ou remplace le lien ; il se coupe seul après ce nombre de jours (null : sans limite). */
    create: suspend (days: Int?) -> GuestShoppingLinkDto?,
    revoke: suspend () -> Boolean,
    onMessage: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var link by remember { mutableStateOf<GuestShoppingLinkDto?>(null) }
    var open by rememberSaveable { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    // Confirmation en cours : « regenerate » ou « revoke ».
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }
    var failed by remember { mutableStateOf(false) }
    // Durée du prochain lien (création ou « Nouveau lien ») : une semaine par défaut ; 0 = sans limite.
    var days by rememberSaveable { mutableIntStateOf(7) }
    LaunchedEffect(online, open) {
        if (online) {
            val loaded = load()
            failed = loaded == null
            if (loaded != null) link = loaded
        }
    }

    val offline = stringResource(R.string.guest_link_offline)
    val error = stringResource(R.string.guest_link_error)
    val copied = stringResource(R.string.guest_link_copied)
    val sendText = stringResource(R.string.guest_link_send_text, householdName)
    val active = link?.url != null
    val label = stringResource(R.string.guest_link_share)
    val activeLabel = stringResource(R.string.guest_link_active)
    val act: (suspend () -> Boolean) -> Unit = { block ->
        scope.launch {
            busy = true
            if (!block()) onMessage(error)
            busy = false
        }
    }

    OutlinedButton(
        onClick = { if (online) open = true else onMessage(offline) },
        modifier = Modifier
            .heightIn(min = 48.dp)
            // Lien actif : dit en toutes lettres, pas seulement par la pastille.
            .semantics { contentDescription = if (active) "$label, $activeLabel" else label },
    ) {
        Icon(painterResource(R.drawable.ic_guest_link), contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(label)
        if (active) {
            Spacer(Modifier.width(8.dp))
            val success = if (isSystemInDarkTheme()) Tokens.Dark.success else Tokens.Light.success
            Box(Modifier.size(8.dp).background(success, CircleShape))
        }
    }
    if (!open) return

    val url = link?.url
    AlertDialog(
        onDismissRequest = { open = false },
        title = { Text(stringResource(R.string.guest_link_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.guest_link_intro), style = MaterialTheme.typography.bodyMedium)
                if (url != null) {
                    SelectionContainer {
                        Text(url, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                    guestLinkCreated(link!!, members)?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(
                        guestLinkExpiry(link!!),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        stringResource(R.string.guest_link_private),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        stringResource(R.string.guest_link_duration_next),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    DurationChoice(days) { days = it }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.Center) {
                        TextButton(
                            onClick = {
                                context.getSystemService(ClipboardManager::class.java)
                                    ?.setPrimaryClip(ClipData.newPlainText(sendText, url))
                                onMessage(copied)
                            },
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) { Text(stringResource(R.string.guest_link_copy)) }
                        TextButton(onClick = { confirm = "regenerate" }, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.guest_link_regenerate))
                        }
                        TextButton(onClick = { confirm = "revoke" }, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.guest_link_revoke))
                        }
                    }
                } else if (link != null) {
                    Text(stringResource(R.string.guest_link_duration), style = MaterialTheme.typography.labelLarge)
                    DurationChoice(days) { days = it }
                } else {
                    Text(
                        stringResource(if (failed) R.string.guest_link_error else R.string.guest_link_loading),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            if (url != null) {
                Button(
                    onClick = {
                        val send = Intent(Intent.ACTION_SEND)
                            .setType("text/plain")
                            .putExtra(Intent.EXTRA_SUBJECT, sendText)
                            .putExtra(Intent.EXTRA_TEXT, "$sendText\n$url")
                        try {
                            context.startActivity(Intent.createChooser(send, sendText))
                        } catch (_: ActivityNotFoundException) {
                            onMessage(error)
                        }
                    },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.guest_link_send)) }
            } else {
                Button(
                    onClick = { act { create(days.takeIf { it > 0 })?.also { link = it } != null } },
                    enabled = !busy && link != null,
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.guest_link_create)) }
            }
        },
        dismissButton = {
            TextButton(onClick = { open = false }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.close))
            }
        },
    )

    confirm?.let { which ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            text = {
                Text(
                    stringResource(
                        if (which == "revoke") R.string.guest_link_confirm_revoke else R.string.guest_link_confirm_regenerate,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirm = null
                        if (which == "revoke") {
                            act { revoke().also { if (it) link = GuestShoppingLinkDto() } }
                        } else {
                            act { create(days.takeIf { it > 0 })?.also { link = it } != null }
                        }
                    },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(stringResource(if (which == "revoke") R.string.guest_link_revoke else R.string.guest_link_regenerate))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirm = null }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

/** « Créé le 9 octobre 2026 par Emma » (ou sans nom si le membre est inconnu). */
@Composable
private fun guestLinkCreated(link: GuestShoppingLinkDto, members: Map<String, Member>): String? {
    val at = link.createdAt?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null
    val date = DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(currentLocale())
        .format(at.atZone(ZoneId.systemDefault()))
    val name = link.createdById?.let { members[it]?.displayName }
    return if (name != null) {
        stringResource(R.string.guest_link_created_by, date, name)
    } else {
        stringResource(R.string.guest_link_created_on, date)
    }
}

/** Durées proposées (jours ; 0 = sans limite), un seul choix à la fois. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DurationChoice(days: Int, onChange: (Int) -> Unit) {
    val choices = listOf(
        1 to R.string.guest_link_day1,
        7 to R.string.guest_link_day7,
        30 to R.string.guest_link_day30,
        0 to R.string.guest_link_no_limit,
    )
    FlowRow(
        Modifier.selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        choices.forEach { (value, label) ->
            FilterChip(
                selected = days == value,
                onClick = { onChange(value) },
                label = { Text(stringResource(label)) },
                modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton },
            )
        }
    }
}

/** « Se coupe tout seul le vendredi 16 octobre à 18:30 », ou le rappel de le couper. */
@Composable
private fun guestLinkExpiry(link: GuestShoppingLinkDto): String {
    val at = link.expiresAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
        ?: return stringResource(R.string.guest_link_no_expiry)
    val date = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.FULL, FormatStyle.SHORT).withLocale(currentLocale())
        .format(at.atZone(ZoneId.systemDefault()))
    return stringResource(R.string.guest_link_expires_on, date)
}
