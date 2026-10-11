package app.tandem.foyer.data

import androidx.test.ext.junit.runners.AndroidJUnit4
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Double authentification (API simulée) : défi après le mot de passe, puis code. */
@RunWith(AndroidJUnit4::class)
class TwoFactorLoginTest {
    private val server = MockWebServer().apply { start() }
    private val tokens = FakeTokenStore(null, null)
    private val repo = AuthRepositoryImpl(ApiClient.create(server.url("/").toString(), tokens), tokens)

    @After fun tearDown() = server.shutdown()

    private fun json(body: String, code: Int = 200) =
        MockResponse().setResponseCode(code).setHeader("content-type", "application/json").setBody(body)

    @Test
    fun `mot de passe puis code - session enregistree seulement a la fin`() = runBlocking {
        server.enqueue(json("""{"twoFactorRequired":true,"challengeId":"00000000-0000-4000-8000-000000000001"}"""))
        val first = repo.login("Emma@Example.be ", "correct horse battery")
        assertEquals(AuthResult.TwoFactorRequired("00000000-0000-4000-8000-000000000001"), first)
        assertNull(tokens.refreshToken())

        server.enqueue(json("""{"error":{"code":"TWO_FACTOR_INVALID","message":"Invalid two-factor code"}}""", 401))
        assertEquals(
            AuthResult.Failure(AuthError.TWO_FACTOR_INVALID),
            repo.completeTwoFactor("00000000-0000-4000-8000-000000000001", "000000"),
        )
        server.enqueue(
            json("""{"user":{"id":"u1","email":"emma@example.be","displayName":"Emma","locale":"fr"},"accessToken":"at","refreshToken":"rt","accessTokenExpiresIn":900}"""),
        )
        val done = repo.completeTwoFactor("00000000-0000-4000-8000-000000000001", " 123456 ")
        assertTrue(done is AuthResult.Success)
        assertEquals("rt", tokens.refreshToken())

        server.takeRequest()
        server.takeRequest()
        val sent = server.takeRequest()
        assertEquals("/v1/auth/2fa/verify", sent.path)
        assertEquals("""{"challengeId":"00000000-0000-4000-8000-000000000001","code":"123456"}""", sent.body.readUtf8())
    }
}
