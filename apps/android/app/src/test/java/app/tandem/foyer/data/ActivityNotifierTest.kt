package app.tandem.foyer.data

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.notifications.ActivityNotifier
import app.tandem.foyer.testing.FakeTokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class ActivityNotifierTest {
    private val server = MockWebServer().apply { start() }
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    @After fun tearDown() {
        server.shutdown()
        context.getSharedPreferences("activity", android.content.Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun `premier passage silencieux, puis seulement les nouvelles non lues a afficher sur le telephone`() = runBlocking {
        val notifier = ActivityNotifier(
            context,
            ApiClient.create(server.url("/").toString(), FakeTokenStore()),
            now = { Instant.parse("2026-09-26T10:00:00Z") },
        )
        assertEquals(emptyList<Any>(), notifier.poll("h1"))
        assertEquals(0, server.requestCount)

        server.enqueue(
            MockResponse().setHeader("content-type", "application/json").setBody(
                """{"unread":2,"items":[
                {"id":"n3","type":"TASK_ASSIGNED","createdAt":"2026-09-26T10:05:00.000Z","push":true,"occurrenceId":"o1","title":"Poubelles","byName":"Nicolas"},
                {"id":"n2","type":"TASK_ASSIGNED","createdAt":"2026-09-26T10:04:00.000Z","push":false,"title":"Lessive","byName":"Nicolas"},
                {"id":"n1","type":"TASK_ASSIGNED","createdAt":"2026-09-26T10:03:00.000Z","readAt":"2026-09-26T10:03:30.000Z","push":true,"title":"Vaisselle","byName":"Nicolas"}
                ]}""",
            ),
        )
        val shown = notifier.poll("h1")
        assertEquals(listOf("n3"), shown.map { it.id })
        val sent = server.takeRequest()
        assertTrue(sent.path!!.startsWith("/v1/households/h1/notifications?since=2026-09-26T10%3A00%3A00Z"))

        server.enqueue(MockResponse().setHeader("content-type", "application/json").setBody("""{"unread":0,"items":[]}"""))
        notifier.poll("h1")
        assertTrue(server.takeRequest().path!!.contains("since=2026-09-26T10%3A05%3A00.000Z"))
    }
}
