package app.tandem.foyer.notifications

import android.content.Context
import android.util.Log
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.PushTokenRequest
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Diagnostic des notifications instantanées sur ce téléphone. */
sealed interface PushState {
    /** Version de l'app construite sans configuration Firebase. */
    data object NotInBuild : PushState
    data object Pending : PushState
    data object Registered : PushState
    data object Offline : PushState
    data class TokenError(val message: String) : PushState
    data class ServerError(val code: Int) : PushState
}

/** Source du jeton du téléphone (Firebase en production, faux en test). */
interface PushTokenSource {
    suspend fun token(): String?
    suspend fun delete()
}

/**
 * Notifications instantanées (docs/android.md) : enregistre le jeton Firebase du téléphone auprès
 * de l'API pour le compte connecté, et le retire à la déconnexion. Sans configuration Firebase
 * dans la build (`tandem.fcm.*`), tout est inactif : l'app relève ses notifications périodiquement.
 */
class PushRegistrar(
    private val api: AgendaApi,
    private val source: PushTokenSource?,
    /** Pourquoi Firebase est indisponible (build sans configuration, initialisation en échec). */
    private val unavailable: PushState = PushState.NotInBuild,
) {
    val enabled: Boolean get() = source != null

    private val _state = MutableStateFlow(if (source == null) unavailable else PushState.Pending)
    /** État affiché dans les Réglages (diagnostic). */
    val state: StateFlow<PushState> = _state

    /** Au lancement (connecté) et à chaque nouveau jeton. N'échoue jamais. */
    suspend fun register(token: String? = null) {
        if (source == null) return
        val value = token ?: try {
            source.token()
        } catch (e: Exception) {
            Log.w(TAG, "Firebase token unavailable", e)
            _state.value = PushState.TokenError(e.message ?: e.javaClass.simpleName)
            return
        } ?: return
        _state.value = try {
            val res = api.registerPushToken(PushTokenRequest(value))
            if (res.isSuccessful) PushState.Registered else PushState.ServerError(res.code())
        } catch (e: IOException) {
            Log.i(TAG, "push token not registered (offline): ${e.message}")
            PushState.Offline
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

        /** Crée le registre à partir de la configuration de la build (état « indisponible » sinon). */
        fun create(api: AgendaApi, context: Context, appId: String, apiKey: String, projectId: String, senderId: String): PushRegistrar {
            if (appId.isBlank() || apiKey.isBlank() || projectId.isBlank()) return PushRegistrar(api, null, PushState.NotInBuild)
            return try {
                PushRegistrar(api, firebase(context, appId, apiKey, projectId, senderId))
            } catch (e: Exception) {
                Log.w(TAG, "Firebase unavailable", e)
                PushRegistrar(api, null, PushState.TokenError(e.message ?: e.javaClass.simpleName))
            }
        }

        /** Initialise Firebase ; lève une exception si la configuration est refusée. */
        private fun firebase(context: Context, appId: String, apiKey: String, projectId: String, senderId: String): PushTokenSource {
            return run {
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
            }
        }
    }
}

private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { cont ->
    addOnCompleteListener { task ->
        val error = task.exception
        if (error != null) cont.resumeWithException(error) else cont.resume(task.result)
    }
}
