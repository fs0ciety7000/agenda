package app.tandem.foyer.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.PasskeysRemote
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.domain.repository.PasskeyOutcome
import app.tandem.foyer.testing.FakeTokenStore
import app.tandem.foyer.ui.settings.PasskeysSection
import app.tandem.foyer.ui.theme.AgendaTheme
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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
import java.util.concurrent.CopyOnWriteArrayList

/** Réglages → Passkeys (API simulée) : liste, ajout par le Credential Manager, suppression. */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "fr-rFR-w400dp-h860dp")
class PasskeysSectionTest {
    @get:Rule val compose = createComposeRule()
    private val requests = CopyOnWriteArrayList<RecordedRequest>()
    /** Le serveur connaît l'app (certificats déclarés) : ajout possible depuis l'app. */
    private var serverKnowsApp = true
    private var list = """[{"id":"k1","name":"Pixel 7","createdAt":"2026-10-09T10:00:00Z","lastUsedAt":null,"synced":true}]"""

    private val server = MockWebServer().apply {
        dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                val path = request.path.orEmpty()
                val body = when {
                    request.method == "DELETE" -> return MockResponse().setResponseCode(204)
                    path == "/v1/auth/providers" ->
                        """{"google":false,"registration":true,"passwordReset":true,"androidPasskeys":$serverKnowsApp}"""
                    path == "/v1/me/passkeys/options" ->
                        """{"challengeId":"00000000-0000-4000-8000-000000000001","options":{"challenge":"xyz","rp":{"id":"tandem-agenda.app","name":"Tandem"}}}"""
                    path == "/v1/me/passkeys" && request.method == "POST" ->
                        """{"id":"k2","name":"Robolectric","createdAt":"2026-10-11T10:00:00Z","lastUsedAt":null,"synced":true}"""
                    else -> list
                }
                return MockResponse().setHeader("content-type", "application/json").setBody(body)
            }
        }
        start()
    }

    @After fun tearDown() = server.shutdown()

    private fun render(messages: MutableList<String>, create: (suspend (android.content.Context, String) -> PasskeyOutcome)?) {
        val remote = PasskeysRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()))
        compose.setContent {
            AgendaTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Box(Modifier.padding(16.dp)) {
                        PasskeysSection(
                            online = true,
                            list = remote::list,
                            available = remote::available,
                            add = remote::add,
                            remove = remote::remove,
                            create = create,
                            onMessage = { messages += it },
                        )
                    }
                }
            }
        }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Pixel 7")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun liste_ajout_et_suppression() {
        val messages = mutableListOf<String>()
        var options: String? = null
        render(messages) { _, json ->
            options = json
            PasskeyOutcome.Done("""{"id":"k2","rawId":"k2","type":"public-key","response":{"attestationObject":"o"}}""")
        }
        compose.onNodeWithText("Ajoutée le 9 oct. 2026 · synchronisée").assertIsDisplayed()

        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Ajouter une passkey")).fetchSemanticsNodes().isNotEmpty() }
        list = list.dropLast(1) + """,{"id":"k2","name":"Robolectric","createdAt":"2026-10-11T10:00:00Z","synced":true}]"""
        compose.onNodeWithText("Ajouter une passkey").performClick()
        compose.waitUntil(5_000) { messages.isNotEmpty() }
        assertEquals("Passkey ajoutée : vous pourrez vous connecter avec.", messages.removeAt(0))
        assertEquals("xyz", Json.parseToJsonElement(options!!).jsonObject["challenge"]!!.jsonPrimitive.content)
        val saved = requests.last { it.method == "POST" && it.path == "/v1/me/passkeys" }
        val body = Json.parseToJsonElement(saved.body.readUtf8()).jsonObject
        assertEquals("00000000-0000-4000-8000-000000000001", body["challengeId"]!!.jsonPrimitive.content)
        assertEquals("k2", body["response"]!!.jsonObject["id"]!!.jsonPrimitive.content)
        // Nommée d'après le téléphone.
        assertTrue(body.containsKey("name"))
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Robolectric")).fetchSemanticsNodes().isNotEmpty() }

        compose.onNodeWithContentDescription("Supprimer « Pixel 7 »").performClick()
        compose.onNodeWithText("Supprimer cette passkey ? Elle ne permettra plus de se connecter.").assertIsDisplayed()
        compose.onNode(hasText("Supprimer") and hasAnyAncestor(isDialog())).performClick()
        compose.waitUntil(5_000) { messages.isNotEmpty() }
        assertEquals("Passkey supprimée.", messages.single())
        assertEquals("/v1/me/passkeys/k1", requests.last { it.method == "DELETE" }.path)
    }

    @Test
    fun fenetre_fermee_sans_message() {
        val messages = mutableListOf<String>()
        render(messages) { _, _ -> PasskeyOutcome.Cancelled }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Ajouter une passkey")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Ajouter une passkey").performClick()
        compose.waitUntil(5_000) { requests.any { it.path == "/v1/me/passkeys/options" } }
        compose.waitForIdle()
        assertTrue(messages.isEmpty())
        assertTrue(requests.none { it.method == "POST" && it.path == "/v1/me/passkeys" })
    }

    @Test
    fun serveur_sans_l_app_ajout_sur_le_site() {
        serverKnowsApp = false
        render(mutableListOf()) { _, _ -> PasskeyOutcome.Failed }
        compose.waitUntil(5_000) {
            compose.onAllNodes(hasText("Pour ajouter une passkey, passez par les Réglages du site.")).fetchSemanticsNodes().isNotEmpty()
        }
        assertTrue(compose.onAllNodes(hasText("Ajouter une passkey")).fetchSemanticsNodes().isEmpty())
    }
}
