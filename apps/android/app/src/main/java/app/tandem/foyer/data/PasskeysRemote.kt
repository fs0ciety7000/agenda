package app.tandem.foyer.data

import android.os.Build
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.PasskeyDto
import app.tandem.foyer.data.remote.PasskeyResponseBody
import app.tandem.foyer.data.remote.TwoFactorStatusDto
import app.tandem.foyer.data.remote.json
import app.tandem.foyer.domain.repository.PasskeyOutcome
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonObject
import java.io.IOException

/** Résultat d'un ajout de passkey depuis les Réglages. */
enum class PasskeyAdd { ADDED, CANCELLED, ALREADY_HERE, FAILED, OFFLINE }

/** Réglages → Passkeys : lues, ajoutées et supprimées en ligne. null / false = hors ligne ou refusé. */
class PasskeysRemote(private val api: AgendaApi) {
    suspend fun list(): List<PasskeyDto>? = call { api.passkeys().body() }

    /** Passkeys de l'app proposées par le serveur (certificats de l'app déclarés). */
    suspend fun available(): Boolean = call { api.providers().body()?.androidPasskeys } ?: false

    /**
     * Défi du serveur → [create] (Credential Manager) → réponse enregistrée sur le compte, nommée
     * d'après le téléphone (« Pixel 7 »), renommable sur le site.
     */
    suspend fun add(create: suspend (optionsJson: String) -> PasskeyOutcome): PasskeyAdd {
        val challenge = call { api.passkeyRegisterOptions().body() } ?: return PasskeyAdd.OFFLINE
        return when (val outcome = create(challenge.options.toString())) {
            is PasskeyOutcome.Done -> {
                val response = try {
                    json.decodeFromString<JsonObject>(outcome.responseJson)
                } catch (_: SerializationException) {
                    return PasskeyAdd.FAILED
                }
                val saved = call {
                    api.addPasskey(PasskeyResponseBody(challenge.challengeId, response, deviceName())).isSuccessful
                }
                when (saved) {
                    true -> PasskeyAdd.ADDED
                    false -> PasskeyAdd.FAILED
                    null -> PasskeyAdd.OFFLINE
                }
            }
            PasskeyOutcome.Cancelled -> PasskeyAdd.CANCELLED
            PasskeyOutcome.AlreadyExists -> PasskeyAdd.ALREADY_HERE
            PasskeyOutcome.NoPasskey, PasskeyOutcome.Failed -> PasskeyAdd.FAILED
        }
    }

    /** Double authentification du compte (gérée sur le site) ; null hors ligne. */
    suspend fun twoFactor(): TwoFactorStatusDto? = call { api.twoFactorStatus().body() }

    suspend fun remove(id: String): Boolean = call { api.deletePasskey(id).isSuccessful.takeIf { it } } ?: false

    private fun deviceName(): String? = Build.MODEL?.trim()?.take(60)?.takeIf { it.isNotEmpty() }

    private suspend fun <T> call(block: suspend () -> T?): T? = withContext(Dispatchers.IO) {
        try {
            block()
        } catch (_: IOException) {
            null
        }
    }
}
