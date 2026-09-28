package app.tandem.foyer.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.auth.Pkce
import app.tandem.foyer.data.auth.PkceStore
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.data.repository.AuthRepositoryImpl
import app.tandem.foyer.domain.repository.AuthError
import app.tandem.foyer.domain.repository.AuthResult
import app.tandem.foyer.testing.FakeTokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.security.MessageDigest
import java.util.Base64

@RunWith(AndroidJUnit4::class)
class GoogleSignInTest {
    private val server = MockWebServer().apply { start() }
    private val tokens = FakeTokenStore(null, null)

    private class MemoryPkce : PkceStore {
        var verifier: String? = null
        override fun create() = Pkce.verifier().also { verifier = it } to Pkce.challenge(verifier!!)
        override fun take() = verifier.also { verifier = null }
    }

    @After fun tearDown() = server.shutdown()

    @Test
    fun `PKCE - challenge = SHA-256 base64url du verifier (RFC 7636)`() {
        val verifier = Pkce.verifier()
        assertTrue(Regex("^[A-Za-z0-9_-]{43}$").matches(verifier))
        val expected = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        assertEquals(expected, Pkce.challenge(verifier))
        // Exemple de la RFC 7636, annexe B.
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    }

    @Test
    fun `URL de depart puis echange du code avec le verifier stocke`() = runBlocking {
        val pkce = MemoryPkce()
        val repo = AuthRepositoryImpl(ApiClient.create(server.url("/").toString(), tokens), tokens, pkce = pkce)
        val url = repo.googleSignInUrl("https://agenda.example/")
        val challenge = url.substringAfter("code_challenge=")
        assertTrue(url.startsWith("https://agenda.example/v1/auth/google/start?client=android&code_challenge="))
        val verifier = pkce.verifier!!
        assertEquals(Pkce.challenge(verifier), challenge)

        server.enqueue(
            MockResponse().setHeader("content-type", "application/json").setBody(
                """{"user":{"id":"u1","email":"g@x.be","displayName":"Grace","locale":"fr"},"accessToken":"at","refreshToken":"rt","accessTokenExpiresIn":900}""",
            ),
        )
        val result = repo.completeGoogleSignIn("the-code", null)
        assertTrue(result is AuthResult.Success)
        val sent = server.takeRequest()
        assertEquals("/v1/auth/google/mobile/exchange", sent.path)
        assertEquals("""{"code":"the-code","codeVerifier":"$verifier"}""", sent.body.readUtf8())
        assertEquals("rt", tokens.refreshToken())
        // Verifier consommé : un second retour ne peut pas être échangé.
        assertEquals(AuthResult.Failure(AuthError.GOOGLE_FAILED), repo.completeGoogleSignIn("the-code", null))
    }

    @Test
    fun `erreurs Google traduites sans appel reseau`() = runBlocking {
        val pkce = MemoryPkce()
        val repo = AuthRepositoryImpl(ApiClient.create(server.url("/").toString(), tokens), tokens, pkce = pkce)
        repo.googleSignInUrl("https://agenda.example/")
        assertEquals(AuthResult.Failure(AuthError.GOOGLE_EMAIL_EXISTS), repo.completeGoogleSignIn(null, "GOOGLE_EMAIL_EXISTS"))
        assertEquals(0, server.requestCount)
    }
}
