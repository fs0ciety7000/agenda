package app.tandem.foyer.ui.share

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R

/** Texte reçu d'une autre app (« Partager → Tandem ») ; `id` distingue deux partages identiques. */
data class SharedText(val text: String, val subject: String?, val id: Int)

/**
 * Titre et contenu d'une note créée depuis un partage : le sujet s'il y en a un (page web,
 * e-mail), sinon la première ligne (raccourcie) ; le texte complet va dans le contenu, sauf s'il
 * tient déjà dans le titre.
 */
fun noteFromShare(text: String, subject: String?): Pair<String, String> {
    val clean = text.trim()
    val title = subject?.trim()?.takeIf { it.isNotEmpty() }
        ?: clean.lineSequence().first().trim().let { if (it.length > 60) it.take(59).trimEnd() + "…" else it }
    val body = if (clean == title) "" else clean
    return title.take(120) to body.take(4000)
}

/** « Ajouter à Tandem » : le texte partagé devient une tâche, une note ou des articles de courses. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareSheet(
    text: String,
    onTask: () -> Unit,
    onNote: () -> Unit,
    onShopping: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                stringResource(R.string.share_title),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            ShareChoice(R.drawable.ic_share_task, stringResource(R.string.share_task), onTask)
            ShareChoice(R.drawable.ic_drawer_note, stringResource(R.string.share_note), onNote)
            ShareChoice(R.drawable.ic_share_cart, stringResource(R.string.share_shopping), onShopping)
        }
    }
}

@Composable
private fun ShareChoice(@DrawableRes icon: Int, label: String, onClick: () -> Unit) {
    OutlinedCard(onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painterResource(icon),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp),
            )
            Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 16.dp))
        }
    }
}
