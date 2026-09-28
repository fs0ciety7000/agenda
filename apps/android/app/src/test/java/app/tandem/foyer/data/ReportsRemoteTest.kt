package app.tandem.foyer.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.data.remote.CreateReportBody
import app.tandem.foyer.data.remote.json
import app.tandem.foyer.testing.FakeTokenStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReportsRemoteTest {
    private val server = MockWebServer().apply { start() }
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
    private val remote = ReportsRemote(context, ApiClient.create(server.url("/").toString(), FakeTokenStore()), db)

    @After fun tearDown() {
        server.shutdown()
        db.close()
    }

    private val report = """{"id":"r1","kind":"BUG","status":"OPEN","title":"Liste blanche","description":"La liste reste blanche.","createdAt":"2026-09-27T10:00:00.000Z"}"""

    @Test
    fun `informations techniques sans donnee personnelle ni contenu de tache`() = runBlocking {
        val d = remote.diagnostics(online = true)
        assertEquals("android", d.platform)
        assertEquals("settings", d.page)
        assertEquals(0, d.pendingChanges)
        assertTrue(d.os!!.startsWith("Android "))
        // Seulement les champs acceptés par l'API (schéma strict) : aucun identifiant d'appareil.
        val keys = json.encodeToJsonElement(app.tandem.foyer.data.remote.ReportDiagnosticsDto.serializer(), d).jsonObject.keys
        assertTrue(keys.all { it in setOf("platform", "appVersion", "os", "device", "locale", "timezone", "screen", "page", "online", "pendingChanges") })
    }

    @Test
    fun `envoi avec capture, puis limite quotidienne et hors ligne`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setHeader("content-type", "application/json").setBody(report))
        server.enqueue(MockResponse().setResponseCode(201).setHeader("content-type", "application/json").setBody(report))
        val body = CreateReportBody("BUG", "Liste blanche", "La liste reste blanche.", allowContact = false)
        val result = remote.send(body, byteArrayOf(1, 2, 3) to "image/png")
        assertEquals(ReportsRemote.SendResult.Sent, result)

        val create = server.takeRequest()
        assertEquals("/v1/reports", create.path)
        val sent = json.parseToJsonElement(create.body.readUtf8()).jsonObject
        assertEquals("BUG", sent["kind"]!!.jsonPrimitive.content)
        // Sans case cochée : aucune information technique.
        assertFalse(sent.containsKey("diagnostics"))
        val upload = server.takeRequest()
        assertEquals("/v1/reports/r1/screenshot", upload.path)
        assertTrue(upload.getHeader("content-type")!!.startsWith("multipart/form-data"))

        server.enqueue(MockResponse().setResponseCode(429).setHeader("content-type", "application/json").setBody("""{"error":{"code":"RATE_LIMITED","message":"x"}}"""))
        assertEquals(ReportsRemote.SendResult.TooMany, remote.send(body, null))

        server.shutdown()
        assertEquals(ReportsRemote.SendResult.Offline, remote.send(body, null))
    }
}
