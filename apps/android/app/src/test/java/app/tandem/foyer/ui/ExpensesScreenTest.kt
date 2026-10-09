package app.tandem.foyer.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollTo
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.ExpensesRemote
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.local.HouseholdEntity
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.testing.FakeTokenStore
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.ui.expenses.ExpensesScreen
import app.tandem.foyer.ui.expenses.ExpensesViewModel
import app.tandem.foyer.ui.theme.AgendaTheme
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.YearMonth

/** Écran Dépenses (API simulée) : solde, budget du mois, évolution ; capture claire et sombre. */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "fr-rFR-w400dp-h860dp-xxhdpi")
class ExpensesScreenTest {
    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
    private val month = YearMonth.now().toString()
    private val g = Fixtures.GRACE
    private val n = Fixtures.NICOLAS
    private val paths = java.util.concurrent.CopyOnWriteArrayList<String>()

    private val server = MockWebServer().apply {
        dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path.orEmpty()
                paths += path
                val body = when {
                    "/expenses/summary" in path -> """{"month":"$month","commonCents":8500,"mineCents":1200,
                        "members":[{"memberId":"$g","weight":1,"balanceCents":4250,"paidCents":8500,"shareCents":4250},
                        {"memberId":"$n","weight":1,"balanceCents":-4250,"paidCents":0,"shareCents":4250}],
                        "transfers":[{"fromMemberId":"$n","toMemberId":"$g","amountCents":4250}],
                        "byCategory":[{"category":"GROCERIES","amountCents":8500}],"budgetCents":10000,
                        "categoryBudgets":[{"category":"GROCERIES","budgetCents":8000}]}"""
                    "/expenses/stats" in path -> """{"budgetCents":10000,"months":[""" +
                        (5 downTo 0).joinToString(",") { i ->
                            val m = YearMonth.now().minusMonths(i.toLong())
                            """{"month":"$m","commonCents":${listOf(6200, 9100, 7400, 10800, 8800, 8500)[5 - i]},"mineCents":0}"""
                        } + "]}"
                    "/expenses/recurring" in path -> "[]"
                    "/expenses" in path -> """[{"id":"e1","kind":"EXPENSE","paidById":"$g","amountCents":8500,
                        "date":"$month-05","title":"Courses de la semaine","category":"GROCERIES","split":"SHARED",
                        "shares":[{"memberId":"$g","amountCents":4250},{"memberId":"$n","amountCents":4250}]}]"""
                    else -> return MockResponse().setResponseCode(404)
                }
                return MockResponse().setHeader("content-type", "application/json").setBody(body)
            }
        }
        start()
    }

    @After fun tearDown() {
        server.shutdown()
        db.close()
    }

    private fun render(dark: Boolean) {
        runBlocking { db.households().insertHousehold(HouseholdEntity(Fixtures.HOUSEHOLD, "Grace & Nico", "Europe/Brussels", g)) }
        val remote = ExpensesRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()), db, context.cacheDir)
        val vm = ExpensesViewModel(remote)
        compose.setContent {
            AgendaTheme(darkTheme = dark) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    ExpensesScreen(vm, Fixtures.household.members, g, onBack = {}, onMessage = {})
                }
            }
        }
        compose.waitUntil(5_000) { compose.onAllNodesWithTextExists("Nicolas doit") }
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTextExists(text: String) =
        onAllNodes(androidx.compose.ui.test.hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun budget_solde_et_evolution() {
        render(dark = false)
        compose.onNodeWithText("Nicolas doit", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Budget commun :", substring = true).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("85 % · reste", substring = true).assertIsDisplayed()
        // Budget Courses dépassé (85 € sur 80 €) : montant en clair.
        compose.onNodeWithText("sur 80,00", substring = true).performScrollTo().assertIsDisplayed()
        compose.onRoot().captureRoboImage("../../../docs/screenshots/android/expenses.png")
        compose.onNodeWithText("Sur 6 mois").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun sombre() {
        render(dark = true)
        compose.onNodeWithText("Nicolas doit", substring = true).assertIsDisplayed()
        compose.onRoot().captureRoboImage("../../../docs/screenshots/android/expenses-dark.png")
    }

    @Test
    fun ouvert_sur_un_autre_mois() {
        // Depuis la recherche : le mois de la dépense, pas le mois en cours.
        val remote = ExpensesRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()), db, context.cacheDir)
        runBlocking { db.households().insertHousehold(HouseholdEntity(Fixtures.HOUSEHOLD, "Grace & Nico", "Europe/Brussels", g)) }
        val vm = ExpensesViewModel(remote, YearMonth.of(2025, 3))
        assertEquals(YearMonth.of(2025, 3), vm.state.value.month)
        compose.waitUntil(5_000) { paths.any { "month=2025-03" in it } }
    }
}
