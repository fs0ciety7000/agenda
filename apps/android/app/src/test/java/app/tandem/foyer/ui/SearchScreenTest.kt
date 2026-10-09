package app.tandem.foyer.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTextInput
import com.github.takahirom.roborazzi.captureRoboImage
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.SearchRemote
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.local.HouseholdEntity
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.testing.FakeTokenStore
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.ui.search.SearchScreen
import app.tandem.foyer.ui.search.SearchTarget
import app.tandem.foyer.ui.theme.AgendaTheme
import kotlinx.coroutines.runBlocking
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

/** Recherche globale (API simulée) : résultats groupés, une tâche ouvre son occurrence, une dépense son mois. */
@RunWith(AndroidJUnit4::class)
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "fr-rFR-w400dp-h860dp-xxhdpi")
class SearchScreenTest {
    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
    private val paths = mutableListOf<String>()

    private val server = MockWebServer().apply {
        dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                paths += request.path.orEmpty()
                return MockResponse().setHeader("content-type", "application/json").setBody(
                    """{"tasks":[{"occurrenceId":"o1","title":"Réserver le garage","date":"2026-10-12","done":false}],
                    "notes":[{"id":"n1","title":"Codes","snippet":"porte du garage 7788"}],
                    "dates":[],"expenses":[{"id":"e1","title":"Vidange au garage","date":"2026-09-14","amountCents":8900}],"shopping":[{"id":"s1","text":"Lave-glace garage","done":false}]}""",
                )
            }
        }
        start()
    }

    @After fun tearDown() {
        server.shutdown()
        db.close()
    }

    @Test
    fun resultats_et_ouverture() {
        runBlocking { db.households().insertHousehold(HouseholdEntity(Fixtures.HOUSEHOLD, "Grace & Nico", "Europe/Brussels", Fixtures.GRACE)) }
        val opened = mutableListOf<SearchTarget>()
        compose.setContent {
            AgendaTheme {
                SearchScreen(SearchRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()), db), onBack = {}) { opened += it }
            }
        }
        compose.onNodeWithText("Tapez au moins 2 lettres.").assertIsDisplayed()
        compose.onNode(hasText("Rechercher dans le foyer")).performTextInput("garage")
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Réserver le garage")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("TÂCHES").assertIsDisplayed()
        compose.onNodeWithText("porte du garage 7788").assertIsDisplayed()
        compose.onNodeWithText("À acheter").assertIsDisplayed()
        compose.onRoot().captureRoboImage("../../../docs/screenshots/android/search.png")
        compose.onNodeWithText("Réserver le garage").performClick()
        // Une dépense ouvre le mois de la dépense, pas le mois en cours.
        compose.onNodeWithText("Vidange au garage").performClick()
        assertEquals(listOf(SearchTarget.Task("o1"), SearchTarget.Page("expenses?month=2026-09")), opened)
        assertTrue(paths.single(), paths.single().endsWith("/search?q=garage"))
    }
}
