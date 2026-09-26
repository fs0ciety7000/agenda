package be.agendagn.app.notifications

import android.content.Context
import android.util.Log
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.data.remote.PushTokenRequest
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Source du jeton du téléphone (Firebase en production, faux en test). */
interface PushTokenSource {
    suspend fun token(): String?
    suspend fun delete()
}

/**
 * Notifications instantanées (docs/android.md) : enregistre le jeton Firebase du téléphone auprès
 * de l'API pour le compte connecté, et le retire à la déconnexion. Sans configuration Firebase
 * dans la build (`agenda.fcm.*`), tout est inactif : l'app relève ses notifications périodiquement.
 */
class PushRegistrar(
    private val api: AgendaApi,
    private val source: PushTokenSource?,
) {
    val enabled: Boolean get() = source != null

    /** Au lancement (connecté) et à chaque nouveau jeton. N'échoue jamais. */
    suspend fun register(token: String? = null) {
        val value = token ?: runCatching { source?.token() }.getOrNull() ?: return
        try {
            api.registerPushToken(PushTokenRequest(value))
        } catch (e: IOException) {
            Log.i(TAG, "push token not registered (offline): ${e.message}")
        }
    }

    /** Avant la déconnexion : ce téléphone ne reçoit plus rien pour ce compte. */
    suspend fun unregister() {
        val value = runCatching { source?.token() }.getOrNull() ?: return
        runCatching { api.unregisterPushToken(value) }
        runCatching { source?.delete() }
    }

    companion object {
        private const val TAG = "PushRegistrar"

        /** Initialise Firebase à partir de la configuration de la build ; null si absente. */
        fun firebase(context: Context, appId: String, apiKey: String, projectId: String, senderId: String): PushTokenSource? {
            if (appId.isBlank() || apiKey.isBlank() || projectId.isBlank()) return null
            return runCatching {
                if (FirebaseApp.getApps(context).isEmpty()) {
                    FirebaseApp.initializeApp(
                        context,
                        FirebaseOptions.Builder()
                            .setApplicationId(appId)
                            .setApiKey(apiKey)
                            .setProjectId(projectId)
                            .setGcmSenderId(senderId)
                            .build(),
                    )
                }
                FirebaseMessaging.getInstance().isAutoInitEnabled = true
                object : PushTokenSource {
                    override suspend fun token(): String? = FirebaseMessaging.getInstance().token.await()
                    override suspend fun delete() {
                        FirebaseMessaging.getInstance().deleteToken().await()
                    }
                }
            }.onFailure { Log.w(TAG, "Firebase unavailable", it) }.getOrNull()
        }
    }
}

private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { cont ->
    addOnCompleteListener { task ->
        val error = task.exception
        if (error != null) cont.resumeWithException(error) else cont.resume(task.result)
    }
}
