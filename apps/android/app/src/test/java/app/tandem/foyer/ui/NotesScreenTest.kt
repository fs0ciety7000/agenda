package app.tandem.foyer.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.NotesRemote
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.local.HouseholdEntity
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.testing.FakeTokenStore
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.ui.notes.NotesScreen
import app.tandem.foyer.ui.notes.NotesViewModel
import app.tandem.foyer.ui.theme.AgendaTheme
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Écran Notes (API simulée) : liste épinglée d'abord, conflit à l'enregistrement ; captures. */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "fr-rFR-w400dp-h860dp-xxhdpi")
class NotesScreenTest {
    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
    private val g = Fixtures.GRACE
    private val n = Fixtures.NICOLAS
    private fun note(id: String, title: String, body: String, pinned: Boolean, by: String, version: Int = 1) =
        """{"id":"$id","title":"$title","body":"$body","pinned":$pinned,"createdById":"$g","updatedById":"$by",
            "createdAt":"2026-10-01T10:00:00.000Z","updatedAt":"2026-10-08T10:00:00.000Z","version":$version}"""
    private val wifi = note("n1", "Wi-Fi", "Réseau : Maison\\nCode : 4F7K-29QM", true, g)
    private val requests = mutableListOf<String>()

    private val server = MockWebServer().apply {
        dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += "${request.method} ${request.path}"
                val json = { b: String -> MockResponse().setHeader("content-type", "application/json").setBody(b) }
                return when {
                    request.path!!.endsWith("/revisions") -> json(
                        """[{"id":"r1","title":"Wi-Fi","body":"Code : ancien","version":1,"editedById":"$n",
                        "savedAt":"2026-10-07T18:30:00.000Z"}]""",
                    )
                    request.path!!.endsWith("/restore") -> json(note("n1", "Wi-Fi", "Code : ancien", true, g, version = 2))
                    else -> when (request.method) {
                    "GET" -> json("[$wifi,${note("n2", "Idées cadeaux", "Livre de cuisine", false, n)}]")
                    // L'autre a modifié « Wi-Fi » entre-temps.
                    "PATCH" -> json(
                        """{"error":{"code":"VERSION_CONFLICT","message":"x","details":{"current":
                        ${note("n1", "Wi-Fi", "Code : 9999", true, n, version = 2)}}}}""",
                    ).setResponseCode(409)
                    "DELETE" -> MockResponse().setResponseCode(204)
                    "POST" -> json(note("n3", "Wi-Fi", "Code : 4F7K-29QM", true, g)).setResponseCode(201)
                    else -> MockResponse().setResponseCode(404)
                    }
                }
            }
        }
        start()
    }

    @After fun tearDown() {
        server.shutdown()
        db.close()
    }

    private val undoable = mutableListOf<Pair<String, () -> Unit>>()
    private val messages = mutableListOf<String>()

    /** La réponse arrive sur un autre fil : on fait tourner la file principale en l'attendant. */
    private fun idleUntil(condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 10_000
        while (!condition() && System.currentTimeMillis() < deadline) {
            org.robolectric.shadows.ShadowLooper.idleMainLooper()
            Thread.sleep(20)
        }
    }

    private fun render(dark: Boolean = false) {
        runBlocking { db.households().insertHousehold(HouseholdEntity(Fixtures.HOUSEHOLD, "Grace & Nico", "Europe/Brussels", g)) }
        val remote = NotesRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()), db)
        val vm = NotesViewModel(remote)
        compose.setContent {
            AgendaTheme(darkTheme = dark) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    NotesScreen(
                        vm,
                        Fixtures.household.members,
                        onBack = {},
                        onMessage = { messages += it },
                        onUndoable = { m, undo -> undoable += m to undo },
                    )
                }
            }
        }
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("Wi-Fi")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun liste_et_conflit() {
        render()
        compose.onNodeWithText("Code : 4F7K-29QM", substring = true).assertIsDisplayed()
        compose.onNodeWithContentDescription("Désépingler « Wi-Fi »").assertIsDisplayed()
        compose.onNodeWithText("Modifiée le 8 oct. par Nicolas").assertIsDisplayed()
        compose.onRoot().captureRoboImage("../../../docs/screenshots/android/notes.png")

        compose.onNodeWithContentDescription("Modifier « Wi-Fi »").performClick()
        compose.onNodeWithText("Contenu").performTextReplacement("Code : 5678")
        compose.onNodeWithText("Enregistrer").performClick()
        compose.waitUntil(5_000) {
            compose.onAllNodes(androidx.compose.ui.test.hasText("modifiée entre-temps", substring = true)).fetchSemanticsNodes().isNotEmpty()
        }
        // La version de l'autre s'affiche dans le formulaire.
        compose.onNodeWithText("Code : 9999").assertIsDisplayed()
        assertEquals(1, requests.count { it.startsWith("PATCH") })
    }

    @Test
    fun sombre() {
        render(dark = true)
        compose.onRoot().captureRoboImage("../../../docs/screenshots/android/notes-dark.png")
    }

    @Test
    fun conflit_lu_depuis_la_reponse() {
        val current = NotesRemote.conflictOf("""{"error":{"code":"VERSION_CONFLICT","details":{"current":$wifi}}}""")
        assertEquals("Wi-Fi", current?.title)
        assertEquals(1, current?.version)
        assertNull(NotesRemote.conflictOf("""{"error":{"code":"VERSION_CONFLICT"}}"""))
    }

    @Test
    fun supprimer_puis_annuler() {
        render()
        compose.onNodeWithContentDescription("Modifier « Wi-Fi »").performClick()
        compose.onNodeWithText("Supprimer").performScrollTo().performClick()
        // La réponse arrive sur un autre fil : on fait tourner la file principale en l'attendant.
        val deadline = System.currentTimeMillis() + 10_000
        while (undoable.isEmpty() && System.currentTimeMillis() < deadline) {
            org.robolectric.shadows.ShadowLooper.idleMainLooper()
            Thread.sleep(20)
        }
        assertEquals("« Wi-Fi » supprimée", undoable.single().first)
        // « Annuler » recrée la note (titre, contenu, épinglage).
        undoable.single().second()
        val posted = System.currentTimeMillis() + 10_000
        while (requests.none { it.startsWith("POST") } && System.currentTimeMillis() < posted) {
            org.robolectric.shadows.ShadowLooper.idleMainLooper()
            Thread.sleep(20)
        }
        assertEquals(1, requests.count { it.startsWith("POST") })
        assertEquals(1, requests.count { it.startsWith("DELETE") })
    }

    @Test
    fun historique_puis_restaurer() {
        render()
        compose.onNodeWithContentDescription("Modifier « Wi-Fi »").performClick()
        compose.onNodeWithText("Versions précédentes").performScrollTo().performClick()
        idleUntil { compose.onAllNodes(androidx.compose.ui.test.hasText("Code : ancien")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Nicolas ·", substring = true).assertExists()
        compose.onNodeWithText("Restaurer cette version").performScrollTo().performClick()
        idleUntil { messages.isNotEmpty() }
        assertTrue(messages.single(), messages.single().startsWith("Version du "))
        assertEquals(1, requests.count { it == "POST /v1/households/${Fixtures.HOUSEHOLD}/notes/n1/revisions/r1/restore" })
    }
}
