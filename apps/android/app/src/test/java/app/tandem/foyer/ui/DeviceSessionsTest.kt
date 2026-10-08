package app.tandem.foyer.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.DevicesRemote
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.testing.FakeTokenStore
import app.tandem.foyer.ui.settings.DeviceSessions
import app.tandem.foyer.ui.theme.AgendaTheme
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.Instant
import java.time.temporal.ChronoUnit

/** Appareils connectés (API simulée) : libellés, « Cet appareil », déconnexion à distance, User-Agent. */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "fr-rFR-w400dp-h860dp")
class DeviceSessionsTest {
    @get:Rule val compose = createComposeRule()
    private val requests = mutableListOf<RecordedRequest>()
    private val now = Instant.now().truncatedTo(ChronoUnit.SECONDS)

    private val server = MockWebServer().apply {
        dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                if (request.method == "DELETE") return MockResponse().setResponseCode(204)
                return MockResponse().setHeader("content-type", "application/json").setBody(
                    """[{"id":"s1","kind":"ANDROID_APP","browser":null,"os":"Android 14","appVersion":"1.9.0",
                    "createdAt":"${now.minus(3, ChronoUnit.DAYS)}","lastUsedAt":"$now","current":true},
                    {"id":"s2","kind":"BROWSER","browser":"Firefox","os":"Linux","appVersion":null,
                    "createdAt":"${now.minus(10, ChronoUnit.DAYS)}","lastUsedAt":"${now.minus(1, ChronoUnit.DAYS)}","current":false}]""",
                )
            }
        }
        start()
    }

    @After fun tearDown() = server.shutdown()

    @Test
    fun liste_et_deconnexion() {
        val messages = mutableListOf<String>()
        val remote = DevicesRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()))
        compose.setContent {
            AgendaTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    androidx.compose.foundation.layout.Box(Modifier.padding(16.dp)) {
                        DeviceSessions(remote) { messages += it }
                    }
                }
            }
        }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Firefox · Linux")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("App Android · Android 14 · Cet appareil").assertIsDisplayed()
        // L'appareil courant ne se déconnecte pas d'ici (bouton « Se déconnecter » plus haut).
        assertEquals(1, compose.onAllNodes(hasText("Déconnecter")).fetchSemanticsNodes().size)

        compose.onNodeWithContentDescription("Déconnecter Firefox · Linux").performClick()
        compose.waitUntil(5_000) { messages.isNotEmpty() }
        assertEquals("Firefox · Linux est déconnecté.", messages.single())
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Firefox · Linux")).fetchSemanticsNodes().isEmpty() }
        assertEquals("/v1/me/sessions/s2", requests.last { it.method == "DELETE" }.path)
        // L'API reconnaît l'app à son User-Agent.
        assertTrue(requests.first().getHeader("User-Agent")!!.startsWith("Tandem-Android/"))
    }
}
