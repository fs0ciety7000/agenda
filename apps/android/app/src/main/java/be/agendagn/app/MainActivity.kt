package be.agendagn.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import be.agendagn.app.notifications.ReminderScheduler
import be.agendagn.app.ui.navigation.AppNavHost
import be.agendagn.app.ui.theme.AgendaTheme

class MainActivity : ComponentActivity() {
    /** Tâche ouverte depuis une notification de rappel. */
    private val openOccurrence = mutableStateOf<String?>(null)

    /** Retour de « Continuer avec Google » (be.agendagn.app://auth?code=…). */
    private val googleCallback = mutableStateOf<Uri?>(null)

    private fun handle(intent: Intent) {
        intent.getStringExtra(ReminderScheduler.EXTRA_ID)?.let { openOccurrence.value = it }
        intent.data?.takeIf { it.scheme == "be.agendagn.app" && it.host == "auth" }?.let { googleCallback.value = it }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handle(intent)
        val container = (application as AgendaApplication).container
        setContent {
            AgendaTheme {
                AppNavHost(
                    container = container,
                    openOccurrenceId = openOccurrence.value,
                    googleCallback = googleCallback.value,
                    onGoogleCallbackHandled = { googleCallback.value = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }
}
