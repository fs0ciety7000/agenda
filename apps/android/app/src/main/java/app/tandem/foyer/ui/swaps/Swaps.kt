package app.tandem.foyer.ui.swaps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.data.SwapsRemote
import app.tandem.foyer.data.remote.SwapDto
import app.tandem.foyer.data.remote.SwapListDto
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.domain.model.OccurrenceStatus
import app.tandem.foyer.domain.model.Visibility
import kotlinx.coroutines.launch

/**
 * Aujourd'hui : demandes d'échange reçues (accepter / refuser) et envoyées (annuler). Relues à
 * chaque changement de `refreshKey` (les tâches du foyer ont bougé). Rien hors ligne.
 */
@Composable
fun SwapBanner(
    remote: SwapsRemote,
    members: List<Member>,
    refreshKey: Any?,
    onChanged: () -> Unit,
    onMessage: (String) -> Unit,
) {
    var swaps by remember { mutableStateOf<SwapListDto?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(refreshKey) { swaps = remote.list() ?: swaps }
    val list = swaps ?: return
    if (list.incoming.isEmpty() && list.outgoing.isEmpty()) return
    val someone = stringResource(R.string.swap_someone)
    val name = { id: String -> members.firstOrNull { it.id == id }?.displayName ?: someone }
    val failed = stringResource(R.string.swap_failed)
    val act = { action: suspend () -> Boolean, ok: String? ->
        scope.launch {
            if (action()) {
                ok?.let(onMessage)
                swaps = remote.list() ?: swaps
                onChanged()
            } else {
                onMessage(failed)
            }
        }
    }
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        list.incoming.forEach { s ->
            val accepted = stringResource(R.string.swap_accepted, s.title)
            OutlinedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.swap_incoming, name(s.fromMemberId), s.title), style = MaterialTheme.typography.bodyLarge)
                    s.note?.let {
                        Text("« $it »", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { act({ remote.accept(s.id) }, accepted) }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.swap_accept))
                        }
                        TextButton(onClick = { act({ remote.decline(s.id) }, null) }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(stringResource(R.string.swap_decline))
                        }
                    }
                }
            }
        }
        list.outgoing.forEach { s ->
            OutgoingRow(s, name(s.toMemberId)) { act({ remote.cancel(s.id) }, null) }
        }
    }
}

@Composable
private fun OutgoingRow(s: SwapDto, to: String, onCancel: () -> Unit) {
    Row(Modifier.fillMaxWidth()) {
        Text(
            stringResource(R.string.swap_outgoing, to, s.title),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f).padding(top = 12.dp),
        )
        TextButton(onClick = onCancel, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.cancel)) }
    }
}

/** Fiche d'une tâche : « Proposer à … » quand je suis responsable d'une tâche partagée à faire. */
@Composable
fun SwapAsk(
    remote: SwapsRemote,
    occurrence: Occurrence,
    members: List<Member>,
    myMemberId: String?,
    onMessage: (String) -> Unit,
) {
    val others = swapCandidates(occurrence, members, myMemberId)
    if (others.isEmpty()) return
    var open by rememberSaveable { mutableStateOf(false) }
    var to by rememberSaveable { mutableStateOf(others.first().id) }
    var note by rememberSaveable { mutableStateOf("") }
    var sentTo by rememberSaveable { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val failed = stringResource(R.string.swap_failed)
    val nameOf = { id: String -> members.firstOrNull { it.id == id }?.displayName.orEmpty() }
    val sentMsg = stringResource(R.string.swap_sent, nameOf(to))
    Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when {
            sentTo != null -> Text(
                stringResource(R.string.swap_waiting, nameOf(sentTo!!)),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            !open -> OutlinedButton(onClick = { open = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(
                    if (others.size == 1) stringResource(R.string.swap_ask_one, others.first().displayName)
                    else stringResource(R.string.swap_ask),
                )
            }
            else -> {
                if (others.size > 1) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        others.forEach { m ->
                            androidx.compose.material3.FilterChip(
                                selected = to == m.id,
                                onClick = { to = m.id },
                                label = { Text(m.displayName) },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it.take(200) },
                    label = { Text(stringResource(R.string.swap_note)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            scope.launch {
                                if (remote.request(occurrence.id, to, note.trim().ifBlank { null })) {
                                    sentTo = to
                                    open = false
                                    onMessage(sentMsg)
                                } else {
                                    onMessage(failed)
                                }
                            }
                        },
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) { Text(stringResource(R.string.swap_send)) }
                    TextButton(onClick = { open = false }, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(stringResource(R.string.cancel))
                    }
                }
            }
        }
    }
}

/**
 * Membres à qui je peux proposer la tâche : seulement si j'en suis responsable, qu'elle est à
 * faire et partagée ; jamais quelqu'un qui en est déjà responsable. Mêmes règles que l'API.
 */
fun swapCandidates(occurrence: Occurrence, members: List<Member>, myMemberId: String?): List<Member> {
    if (myMemberId == null || myMemberId !in occurrence.assigneeIds) return emptyList()
    if (occurrence.status != OccurrenceStatus.TODO || occurrence.visibility == Visibility.PERSONAL) return emptyList()
    return members.filter { it.id != myMemberId && it.id !in occurrence.assigneeIds }
}
