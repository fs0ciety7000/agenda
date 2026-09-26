package be.agendagn.app.data.monitoring

import android.content.Context
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.data.remote.ClientErrorRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File

/**
 * Plantages : enregistrés sur le téléphone au moment du crash (aucun réseau fiable à cet
 * instant), puis envoyés à l'API au lancement suivant (`/v1/client-errors` → logs + Sentry).
 * Seuls le type d'erreur, la pile d'appels et la version partent : aucune donnée de tâche.
 */
class CrashReporter(
    context: Context,
    private val api: AgendaApi,
    private val release: String,
) {
    private val file = File(context.filesDir, "last-crash.txt")

    fun install() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                file.writeText("${error.javaClass.name}: ${error.message.orEmpty()}\n${error.stackTraceToString()}".take(8_500))
            }
            previous?.uncaughtException(thread, error)
        }
        if (file.exists()) CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { sendPending() }
    }

    suspend fun sendPending() {
        val text = runCatching { file.readText() }.getOrNull() ?: return
        val message = text.lineSequence().first().take(500)
        val sent = runCatching {
            api.reportClientError(
                ClientErrorRequest(source = "android", message = message, stack = text.take(8_000), location = "crash", release = release),
            ).isSuccessful
        }.getOrDefault(false)
        if (sent) file.delete()
    }
}
