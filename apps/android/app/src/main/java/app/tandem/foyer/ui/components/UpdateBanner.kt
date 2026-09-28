package app.tandem.foyer.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.data.update.UpdateManifest
import app.tandem.foyer.data.update.UpdateState

/** Bandeau « Nouvelle version disponible » avec téléchargement et installation en un geste. */
@Composable
fun UpdateBanner(manifest: UpdateManifest, state: UpdateState, canInstall: Boolean, onUpdate: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                stringResource(R.string.update_available, manifest.versionName),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.semantics { liveRegionPolite() },
            )
            when (state) {
                is UpdateState.Downloading -> {
                    Text(stringResource(R.string.update_downloading, state.percent), style = MaterialTheme.typography.bodySmall)
                    LinearProgressIndicator(progress = { state.percent / 100f }, modifier = Modifier.fillMaxWidth())
                }
                else -> {
                    Text(
                        stringResource(
                            when {
                                state is UpdateState.Failed -> R.string.update_failed
                                !canInstall -> R.string.update_permission_hint
                                else -> R.string.update_hint
                            },
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Button(onClick = onUpdate, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(stringResource(if (canInstall) R.string.update_install else R.string.update_allow))
                    }
                }
            }
        }
    }
}
