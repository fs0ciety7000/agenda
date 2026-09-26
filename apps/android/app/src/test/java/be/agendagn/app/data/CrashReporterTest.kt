package be.agendagn.app.data

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import be.agendagn.app.data.monitoring.CrashReporter
import be.agendagn.app.data.remote.ApiClient
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
import java.io.File

@RunWith(AndroidJUnit4::class)
class CrashReporterTest {
    private val server = MockWebServer().apply { start() }
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val file = File(context.filesDir, "last-crash.txt")

    @After fun tearDown() {
        server.shutdown()
        file.delete()
    }

    @Test
    fun `crash enregistre puis envoye au lancement suivant, supprime seulement si recu`() = runBlocking {
        val api = ApiClient.create(server.url("/").toString(), FakeTokenStore())
        val reporter = CrashReporter(context, api, "0.3.12")
        file.writeText("java.lang.IllegalStateException: boom\n\tat be.agendagn.app.X.y(X.kt:1)")

        server.enqueue(MockResponse().setResponseCode(503))
        reporter.sendPending()
        assertTrue("conservé si l'API ne répond pas", file.exists())

        server.enqueue(MockResponse().setResponseCode(204))
        reporter.sendPending()
        assertFalse(file.exists())
        server.takeRequest()
        val sent = server.takeRequest()
        assertEquals("/v1/client-errors", sent.path)
        val body = sent.body.readUtf8()
        assertTrue(body.contains("\"source\":\"android\""))
        assertTrue(body.contains("\"message\":\"java.lang.IllegalStateException: boom\""))
        assertTrue(body.contains("\"release\":\"0.3.12\""))
    }
}
