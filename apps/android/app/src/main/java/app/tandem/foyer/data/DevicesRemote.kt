package app.tandem.foyer.data

import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.DeviceSessionDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

/** « Appareils connectés » : lus et déconnectés en ligne. null / false = hors ligne ou refusé. */
class DevicesRemote(private val api: AgendaApi) {
    suspend fun list(): List<DeviceSessionDto>? = call { api.deviceSessions().body() }

    /** Déconnecte un autre appareil (toute sa famille de sessions). */
    suspend fun revoke(id: String): Boolean = call { api.revokeDeviceSession(id).isSuccessful.takeIf { it } } ?: false

    private suspend fun <T> call(block: suspend () -> T?): T? = withContext(Dispatchers.IO) {
        try {
            block()
        } catch (_: IOException) {
            null
        }
    }
}
