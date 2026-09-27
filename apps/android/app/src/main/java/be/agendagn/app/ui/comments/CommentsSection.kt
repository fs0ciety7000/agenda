package be.agendagn.app.ui.comments

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import be.agendagn.app.R
import be.agendagn.app.data.CommentsRemote
import be.agendagn.app.data.remote.CommentDto
import be.agendagn.app.domain.model.Member
import be.agendagn.app.ui.taskform.relativeTime
import kotlinx.coroutines.launch
import java.time.Instant

/** Fil de commentaires d'une tâche, rafraîchi en temps réel. */
@Composable
fun CommentsSection(
    remote: CommentsRemote,
    occurrenceId: String,
    members: List<Member>,
    myMemberId: String?,
    onMessage: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<CommentDto>?>(null) }
    var draft by rememberSaveable { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<CommentDto?>(null) }
    val failed = stringResource(R.string.comment_failed)
    val former = stringResource(R.string.history_former_member)
    val reload: suspend () -> Unit = { remote.list(occurrenceId)?.let { items = it } }

    LaunchedEffect(occurrenceId) {
        reload()
        remote.updates.collect { reload() }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.comments_title), style = MaterialTheme.typography.titleSmall)
        items.orEmpty().forEach { c ->
            val author = members.firstOrNull { it.id == c.authorId }?.displayName ?: former
            val at = runCatching { Instant.parse(c.createdAt) }.getOrNull()
            Row(verticalAlignment = Alignment.Top) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                        Text(
                            listOfNotNull(author, at?.let { relativeTime(it) }).joinToString(" · "),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(c.body, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (c.authorId != null && c.authorId == myMemberId) {
                    IconButton(onClick = { confirm = c }) {
                        Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.comment_delete))
                    }
                }
            }
        }
        if (items == null) {
            Text(
                stringResource(R.string.comments_offline),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { if (it.length <= 2000) draft = it },
                label = { Text(stringResource(R.string.comment_placeholder)) },
                modifier = Modifier.weight(1f),
            )
            IconButton(
                enabled = draft.isNotBlank() && !sending,
                onClick = {
                    val body = draft.trim()
                    sending = true
                    scope.launch {
                        if (remote.add(occurrenceId, body)) {
                            draft = ""
                            reload()
                        } else {
                            onMessage(failed)
                        }
                        sending = false
                    }
                },
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.comment_send))
            }
        }
    }

    confirm?.let { c ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(stringResource(R.string.comment_delete)) },
            text = { Text(c.body, maxLines = 3) },
            confirmButton = {
                TextButton(onClick = {
                    confirm = null
                    scope.launch { if (remote.delete(c.id)) reload() else onMessage(failed) }
                }) { Text(stringResource(R.string.comment_delete_confirm)) }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text(stringResource(android.R.string.cancel)) } },
        )
    }
}

