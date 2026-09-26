package be.agendagn.app.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import be.agendagn.app.data.remote.ApiClient
import be.agendagn.app.notifications.PushRegistrar
import be.agendagn.app.notifications.PushState
import be.agendagn.app.notifications.PushTokenSource
import be.agendagn.app.testing.FakeTokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PushRegistrarTest {
    private val server = MockWebServer().apply { start() }
    private val api = ApiClient.create(server.url("/").toString(), FakeTokenStore())

    private class FakeSource : PushTokenSource {
        var deleted = false
        override suspend fun token() = "phone-token-123"
        override suspend fun delete() { deleted = true }
    }

    @After fun tearDown() = server.shutdown()

    @Test
    fun `enregistre le jeton du telephone, puis le retire a la deconnexion`() = runBlocking {
        val source = FakeSource()
        val push = PushRegistrar(api, source)
        assertTrue(push.enabled)

        server.enqueue(MockResponse().setResponseCode(204))
        assertEquals(PushState.Pending, push.state.value)
        push.register()
        assertEquals(PushState.Registered, push.state.value)
        val put = server.takeRequest()
        assertEquals("PUT", put.method)
        assertEquals("/v1/me/push-tokens", put.path)
        assertEquals("""{"token":"phone-token-123"}""", put.body.readUtf8()) // plateforme : android par défaut côté API

        server.enqueue(MockResponse().setResponseCode(204))
        push.unregister()
        val delete = server.takeRequest()
        assertEquals("DELETE", delete.method)
        assertEquals("/v1/me/push-tokens/phone-token-123", delete.path)
        assertTrue(source.deleted)
    }

    @Test
    fun `sans configuration Firebase ou hors ligne - rien ne casse`() = runBlocking {
        val disabled = PushRegistrar(api, null)
        assertFalse(disabled.enabled)
        disabled.register()
        disabled.unregister()
        assertEquals(0, server.requestCount)
        assertEquals(PushState.NotInBuild, disabled.state.value)

        val refused = PushRegistrar(api, FakeSource())
        server.enqueue(MockResponse().setResponseCode(401))
        refused.register()
        assertEquals(PushState.ServerError(401), refused.state.value)

        server.shutdown() // hors ligne
        val offline = PushRegistrar(api, FakeSource())
        offline.register()
        assertEquals(PushState.Offline, offline.state.value)
    }
}
