package be.agendagn.app

import android.content.Intent
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        openOccurrence.value = intent.getStringExtra(ReminderScheduler.EXTRA_ID)
        val container = (application as AgendaApplication).container
        setContent {
            AgendaTheme {
                AppNavHost(container = container, openOccurrenceId = openOccurrence.value)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openOccurrence.value = intent.getStringExtra(ReminderScheduler.EXTRA_ID)
    }
}
