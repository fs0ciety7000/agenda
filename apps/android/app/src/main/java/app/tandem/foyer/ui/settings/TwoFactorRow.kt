package app.tandem.foyer.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.data.remote.TwoFactorStatusDto

/**
 * Réglages → Compte : état de la double authentification. Elle s'active et se gère sur le site
 * (QR code à scanner, codes de secours à garder) ; l'app demande le code à la connexion.
 */
@Composable
fun TwoFactorRow(online: Boolean, status: suspend () -> TwoFactorStatusDto?, onManage: () -> Unit) {
    var current by remember { mutableStateOf<TwoFactorStatusDto?>(null) }
    LaunchedEffect(online) { if (online) status()?.let { current = it } }
    val shown = current
    if (shown != null && !shown.available) return
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            stringResource(R.string.two_factor_settings_title),
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            stringResource(
                when (shown?.enabled) {
                    true -> R.string.two_factor_settings_on
                    false -> R.string.two_factor_settings_off
                    null -> R.string.two_factor_settings_intro
                },
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton(onClick = onManage, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(stringResource(R.string.two_factor_settings_manage))
        }
    }
}
