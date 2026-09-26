package be.agendagn.app.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Temps réel (même flux SSE que le site, `GET …/events`) tant que l'app est à l'écran :
 * émet le sujet modifié (« tasks », « shopping », « notifications »), et [CONNECTED] à chaque
 * (re)connexion pour rattraper ce qui a pu changer pendant une coupure.
 */
class RealtimeClient(private val baseUrl: String, client: OkHttpClient) {
    // Un « ping » arrive toutes les 25 s : au-delà de 60 s sans rien, la connexion est morte.
    private val http = client.newBuilder().readTimeout(60, TimeUnit.SECONDS).build()

    fun topics(householdId: String): Flow<String> = callbackFlow {
        // La lecture est bloquante : l'annulation passe par l'appel HTTP lui-même.
        var current: Call? = null
        val job = launch {
            var attempt = 0
            while (isActive) {
                val request = Request.Builder()
                    .url("${baseUrl}v1/households/$householdId/events")
                    .header("Accept", "text/event-stream")
                    .build()
                val call = http.newCall(request).also { current = it }
                try {
                    call.execute().use { res ->
                        if (!res.isSuccessful) throw IOException("HTTP ${res.code}")
                        attempt = 0
                        trySend(CONNECTED)
                        val source = res.body!!.source()
                        var event = ""
                        while (isActive) {
                            val line = source.readUtf8Line() ?: break
                            when {
                                line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                                line.startsWith("data:") && event == "change" -> parseTopic(line.removePrefix("data:"))?.let(::trySend)
                                line.isEmpty() -> event = ""
                            }
                        }
                    }
                } catch (_: IOException) {
                    // Réseau coupé, serveur redémarré, session expirée : on réessaie plus tard.
                } finally {
                    call.cancel()
                }
                attempt++
                delay(minOf(60_000L, 1_000L shl minOf(attempt, 6)))
            }
        }
        awaitClose {
            job.cancel()
            current?.cancel()
        }
    }.flowOn(Dispatchers.IO)

    private fun parseTopic(data: String): String? = runCatching {
        json.parseToJsonElement(data.trim()).jsonObject["topic"]?.jsonPrimitive?.content
    }.getOrNull()

    companion object {
        const val CONNECTED = "connected"
    }
}
