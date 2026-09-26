package be.agendagn.app.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import be.agendagn.app.data.remote.ApiClient
import be.agendagn.app.data.remote.RealtimeClient
import be.agendagn.app.testing.FakeTokenStore
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RealtimeClientTest {
    private val server = MockWebServer().apply { start() }

    @After fun tearDown() = server.shutdown()

    private fun sse(body: String) =
        MockResponse().setHeader("content-type", "text/event-stream").setBody(body)

    @Test
    fun `sujets du foyer, ping ignore, reconnexion signalee apres une coupure`() = runBlocking {
        server.enqueue(sse("event: ping\ndata: {}\n\nevent: change\nid: 1\ndata: {\"topic\":\"shopping\"}\n\n"))
        server.enqueue(MockResponse().setResponseCode(503)) // coupure : on réessaie
        server.enqueue(sse("event: change\ndata: {\"topic\":\"tasks\"}\n\n"))
        val (_, http) = ApiClient.createWithClient(server.url("/").toString(), FakeTokenStore())
        val client = RealtimeClient(server.url("/").toString(), http)
        val topics = withTimeout(15_000) { client.topics("h1").take(4).toList() }
        assertEquals(listOf("connected", "shopping", "connected", "tasks"), topics)
        val first = server.takeRequest()
        assertEquals("/v1/households/h1/events", first.path)
        assertEquals("text/event-stream", first.getHeader("Accept"))
        assertEquals("agenda-gn", first.getHeader("X-Requested-With"))
    }
}
