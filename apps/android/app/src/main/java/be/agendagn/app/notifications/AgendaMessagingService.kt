package be.agendagn.app.notifications

import be.agendagn.app.AgendaApplication
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Réveil envoyé par le serveur (message sans contenu : `kind=activity`). L'app relit alors ses
 * notifications et son cache par l'API, exactement comme lors d'une synchronisation.
 */
class AgendaMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        val container = (application as AgendaApplication).container
        scope.launch { if (container.authRepository.isSignedIn.first()) container.push.register(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["kind"] != "activity") return
        val householdId = message.data["householdId"] ?: return
        val container = (application as AgendaApplication).container
        // Appelé hors du fil principal ; Android laisse ~10 s avant de reprendre la main.
        runBlocking {
            withTimeoutOrNull(9_000) {
                container.activityNotifier.poll(householdId)
                container.repository.refresh()
            }
        }
    }
}
