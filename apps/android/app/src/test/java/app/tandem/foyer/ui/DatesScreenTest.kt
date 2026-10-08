package app.tandem.foyer.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.DatesRemote
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.local.HouseholdEntity
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.testing.FakeTokenStore
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.ui.dates.DatesScreen
import app.tandem.foyer.ui.dates.DatesViewModel
import app.tandem.foyer.ui.theme.AgendaTheme
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Écran Dates importantes (API simulée) : liste, résumé, rappel ; capture. */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "fr-rFR-w400dp-h860dp-xxhdpi")
class DatesScreenTest {
    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
    private val bodies = mutableListOf<String>()

    private val server = MockWebServer().apply {
        dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val json = MockResponse().setHeader("content-type", "application/json")
                if (request.method != "GET") {
                    bodies += request.body.readUtf8()
                    return json.setBody(
                        """{"id":"d1","title":"Anniversaire de mamie","kind":"BIRTHDAY","month":10,"day":13,"year":1950,
                        "repeatsYearly":true,"remindDaysBefore":7,"nextDate":"2026-10-13","daysLeft":5,"years":76}""",
                    )
                }
                return MockResponse().setHeader("content-type", "application/json").setBody(
                    """[{"id":"d1","title":"Anniversaire de mamie","kind":"BIRTHDAY","month":10,"day":13,"year":1950,
                    "repeatsYearly":true,"remindDaysBefore":7,"nextDate":"2026-10-13","daysLeft":5,"years":76},
                    {"id":"d2","title":"Entretien chaudière","kind":"MAINTENANCE","month":11,"day":17,
                    "repeatsYearly":true,"remindDaysBefore":0,"nextDate":"2026-11-17","daysLeft":1,"years":null}]""",
                )
            }
        }
        start()
    }

    @After fun tearDown() {
        server.shutdown()
        db.close()
    }

    private fun render(dark: Boolean = false) {
        runBlocking { db.households().insertHousehold(HouseholdEntity(Fixtures.HOUSEHOLD, "Grace & Nico", "Europe/Brussels", Fixtures.GRACE)) }
        val vm = DatesViewModel(DatesRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()), db))
        compose.setContent {
            AgendaTheme(darkTheme = dark) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    DatesScreen(vm, onBack = {}, onMessage = {})
                }
            }
        }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Anniversaire de mamie")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun liste_resume_et_rappel() {
        render()
        compose.onNodeWithText("Anniversaire · mardi 13 octobre · dans 5 jours · 76 ans").assertIsDisplayed()
        compose.onNodeWithText("Entretien · mardi 17 novembre · demain").assertIsDisplayed()
        compose.onNodeWithText("Rappel 7 j avant").assertIsDisplayed()
        compose.onNodeWithText("Rappel le jour même").assertIsDisplayed()
        compose.onRoot().captureRoboImage("../../../docs/screenshots/android/dates.png")

        // Enregistrer sans rien changer : l'année connue part avec la date.
        compose.onNodeWithText("Anniversaire de mamie").performClick()
        compose.onNodeWithText("Date : 13 octobre 1950").assertIsDisplayed()
        compose.onNodeWithText("Le jour même").assertIsDisplayed()
        compose.onNodeWithText("Enregistrer").performClick()
        compose.waitUntil(5_000) { bodies.isNotEmpty() }
        assertTrue(bodies.single(), bodies.single().contains("\"year\":1950"))
        assertTrue(bodies.single(), bodies.single().contains("\"month\":10") && bodies.single().contains("\"day\":13"))
    }
}
