package app.tandem.foyer

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.core.view.WindowCompat
import app.tandem.foyer.data.AppLanguage
import app.tandem.foyer.notifications.ReminderScheduler
import app.tandem.foyer.ui.navigation.AppNavHost
import app.tandem.foyer.ui.theme.AgendaTheme

class MainActivity : ComponentActivity() {
    /** Tâche ouverte depuis une notification de rappel. */
    private val openOccurrence = mutableStateOf<String?>(null)

    /** Retour de « Continuer avec Google » (app.tandem.foyer://auth?code=…). */
    private val googleCallback = mutableStateOf<Uri?>(null)

    /** « + » du widget : incrémenté à chaque demande d'ajout rapide. */
    private val quickAddRequest = mutableIntStateOf(0)

    /** Texte à placer dans l'ajout rapide (partage depuis une autre app, Assistant). */
    private val quickAddText = mutableStateOf<String?>(null)

    /** Raccourci « Dicter une tâche » : incrémenté à chaque demande. */
    private val voiceRequest = mutableIntStateOf(0)

    /** Onglet demandé (widget, raccourci) : (route, numéro de demande). */
    private val tabRequest = mutableStateOf<Pair<String, Int>?>(null)

    private fun handle(intent: Intent) {
        if (intent.action == ACTION_QUICK_ADD || intent.action == Intent.ACTION_SEND) {
            quickAddText.value = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.take(500)?.takeIf { it.isNotEmpty() }
            quickAddRequest.intValue++
        }
        if (intent.action == ACTION_VOICE) voiceRequest.intValue++
        if (intent.action == ACTION_OPEN_TAB) {
            intent.getStringExtra(EXTRA_TAB)?.let { tabRequest.value = it to ((tabRequest.value?.second ?: 0) + 1) }
        }
        intent.getStringExtra(ReminderScheduler.EXTRA_ID)?.let { openOccurrence.value = it }
        intent.data?.takeIf { it.scheme == "app.tandem.foyer" && it.host == "auth" }?.let { googleCallback.value = it }
    }

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(AppLanguage.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Bord à bord : le contenu passe sous les barres système, dont les couleurs viennent du
        // thème (res/values*/themes.xml). Pas d'enableEdgeToEdge(), qui appelle des API rendues
        // obsolètes par Android 15 (signalées par Google Play). Android 15+ l'impose de lui-même.
        if (android.os.Build.VERSION.SDK_INT < 35) WindowCompat.setDecorFitsSystemWindows(window, false)
        handle(intent)
        val container = (application as AgendaApplication).container
        setContent {
            AgendaTheme {
                AppNavHost(
                    container = container,
                    openOccurrenceId = openOccurrence.value,
                    quickAddRequest = quickAddRequest.intValue,
                    quickAddText = quickAddText.value,
                    voiceRequest = voiceRequest.intValue,
                    tabRequest = tabRequest.value,
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

    companion object {
        const val ACTION_QUICK_ADD = "app.tandem.foyer.QUICK_ADD"
        const val ACTION_OPEN_TAB = "app.tandem.foyer.OPEN_TAB"
        const val ACTION_VOICE = "app.tandem.foyer.VOICE"
        const val EXTRA_TAB = "tab"
        const val TAB_SHOPPING = "shopping"
        const val TAB_TODAY = "today"
    }
}
