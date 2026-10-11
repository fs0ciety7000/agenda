package app.tandem.foyer.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.data.repository.AuthRepositoryImpl
import app.tandem.foyer.domain.repository.AuthError
import app.tandem.foyer.domain.repository.AuthResult
import app.tandem.foyer.domain.repository.PasskeyOutcome
import app.tandem.foyer.testing.FakeTokenStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Connexion par passkey (API simulée) : défi → Credential Manager → session enregistrée. */
@RunWith(AndroidJUnit4::class)
class PasskeyLoginTest {
    private val server = MockWebServer().apply { start() }
    private val tokens = FakeTokenStore(null, null)
    private val repo = AuthRepositoryImpl(ApiClient.create(server.url("/").toString(), tokens), tokens)

    @After fun tearDown() = server.shutdown()

    private fun json(body: String, code: Int = 200) =
        MockResponse().setResponseCode(code).setHeader("content-type", "application/json").setBody(body)

    private val options =
        """{"challengeId":"00000000-0000-4000-8000-000000000001","options":{"challenge":"abc","rpId":"tandem-agenda.app","allowCredentials":[]}}"""

    @Test
    fun `options passees au telephone, reponse renvoyee, session enregistree`() = runBlocking {
        server.enqueue(json(options))
        server.enqueue(
            json("""{"user":{"id":"u1","email":"emma@example.be","displayName":"Emma","locale":"fr"},"accessToken":"at","refreshToken":"rt","accessTokenExpiresIn":900}"""),
        )
        var received: String? = null
        val result = repo.loginWithPasskey { optionsJson ->
            received = optionsJson
            PasskeyOutcome.Done("""{"id":"cred","rawId":"cred","type":"public-key","response":{"signature":"sig"}}""")
        }
        assertTrue(result is AuthResult.Success)
        // Le Credential Manager reçoit les options WebAuthn telles quelles.
        val sentOptions = Json.parseToJsonElement(received!!).jsonObject
        assertEquals("abc", sentOptions["challenge"]!!.jsonPrimitive.content)
        assertEquals("tandem-agenda.app", sentOptions["rpId"]!!.jsonPrimitive.content)

        assertEquals("/v1/auth/passkeys/options", server.takeRequest().path)
        val login = server.takeRequest()
        assertEquals("/v1/auth/passkeys/login", login.path)
        // Jetons dans le corps de la réponse (client mobile).
        assertEquals("mobile", login.getHeader("X-Client"))
        val body = Json.parseToJsonElement(login.body.readUtf8()).jsonObject
        assertEquals("00000000-0000-4000-8000-000000000001", body["challengeId"]!!.jsonPrimitive.content)
        assertEquals("cred", body["response"]!!.jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals("rt", tokens.refreshToken())
    }

    @Test
    fun `fenetre fermee ou aucune passkey - rien n'est envoye au serveur`() = runBlocking {
        server.enqueue(json(options))
        assertEquals(AuthResult.Failure(AuthError.PASSKEY_CANCELLED), repo.loginWithPasskey { PasskeyOutcome.Cancelled })
        server.enqueue(json(options))
        assertEquals(AuthResult.Failure(AuthError.NO_PASSKEY), repo.loginWithPasskey { PasskeyOutcome.NoPasskey })
        assertEquals(2, server.requestCount)
        assertNull(tokens.refreshToken())
    }

    @Test
    fun `passkey refusee par le serveur`() = runBlocking {
        server.enqueue(json(options))
        server.enqueue(json("""{"error":{"code":"PASSKEY_FAILED","message":"Passkey verification failed"}}""", 400))
        val result = repo.loginWithPasskey { PasskeyOutcome.Done("""{"id":"cred"}""") }
        assertEquals(AuthResult.Failure(AuthError.PASSKEY_FAILED), result)
        assertNull(tokens.refreshToken())
    }

    @Test
    fun `proposees seulement si le serveur connait l'app`() = runBlocking {
        server.enqueue(json("""{"google":false,"registration":true,"passwordReset":true,"androidPasskeys":true}"""))
        assertTrue(repo.passkeysAvailable())
        // Réponse gardée : pas de second appel pour Google.
        assertEquals(false, repo.googleAvailable())
        assertEquals(1, server.requestCount)
    }
}
