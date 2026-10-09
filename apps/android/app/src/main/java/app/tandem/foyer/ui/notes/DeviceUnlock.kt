package app.tandem.foyer.ui.notes

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext

/**
 * Vérifie l'empreinte, le visage ou le code du téléphone avant d'afficher une note sensible
 * (API du système, sans bibliothèque). Android 10 et plus : BiometricPrompt ; Android 8 et 9 : écran de
 * confirmation du code. Téléphone sans verrouillage d'écran : rien à vérifier, le contenu s'affiche.
 */
@Composable
fun rememberDeviceUnlock(title: String, subtitle: String): (onUnlocked: () -> Unit) -> Unit {
    val context = LocalContext.current
    var pending by remember { mutableStateOf<(() -> Unit)?>(null) }
    val confirm = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) pending?.invoke()
        pending = null
    }
    return { onUnlocked ->
        val keyguard = context.getSystemService(KeyguardManager::class.java)
        when {
            keyguard == null || !keyguard.isDeviceSecure -> onUnlocked()
            Build.VERSION.SDK_INT >= 29 -> prompt(context, title, subtitle, onUnlocked)
            else -> {
                @Suppress("DEPRECATION")
                val intent = keyguard.createConfirmDeviceCredentialIntent(title, subtitle)
                if (intent == null) {
                    onUnlocked()
                } else {
                    pending = onUnlocked
                    confirm.launch(intent)
                }
            }
        }
    }
}

@RequiresApi(29)
private fun prompt(context: Context, title: String, subtitle: String, onUnlocked: () -> Unit) {
    val builder = BiometricPrompt.Builder(context).setTitle(title).setSubtitle(subtitle)
    if (Build.VERSION.SDK_INT >= 30) {
        builder.setAllowedAuthenticators(
            BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL,
        )
    } else {
        @Suppress("DEPRECATION")
        builder.setDeviceCredentialAllowed(true)
    }
    builder.build().authenticate(
        CancellationSignal(),
        context.mainExecutor,
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onUnlocked()
        },
    )
}
