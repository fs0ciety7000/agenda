package app.tandem.foyer.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.domain.Agenda
import app.tandem.foyer.domain.RecurrenceSpec
import app.tandem.foyer.domain.RepeatPreset
import app.tandem.foyer.domain.RotationKind
import app.tandem.foyer.domain.model.ShoppingItem
import app.tandem.foyer.domain.model.TaskDraft
import app.tandem.foyer.domain.repository.SyncState
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.testing.Fixtures.TODAY
import app.tandem.foyer.ui.calendar.CalendarScreen
import app.tandem.foyer.ui.main.AgendaUiState
import app.tandem.foyer.ui.shopping.ShoppingScreen
import app.tandem.foyer.ui.taskform.TaskFormScreen
import app.tandem.foyer.ui.taskform.TaskFormState
import app.tandem.foyer.ui.tasks.TasksScreen
import app.tandem.foyer.ui.theme.AgendaTheme
import app.tandem.foyer.ui.today.TodayScreen
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.YearMonth

/**
 * Captures de la fiche Play Store (fastlane/metadata/android/<langue>/images/phoneScreenshots),
 * 1080 × 2160 (rapport 2:1 maximum exigé par Google Play). Générées seulement sur demande :
 * ./gradlew testDebugUnitTest --tests '*StoreScreenshots*' -Pscreenshots
 * (ou le workflow « Google Play — mettre à jour la fiche », case des images cochée).
 * Foyer public d'Emma et Tom, données traduites dans la langue de la fiche.
 */
abstract class StoreScreenshots(private val locale: String) {
    @get:Rule val compose = createComposeRule()

    /** Texte de démonstration dans la langue de la fiche (français par défaut). */
    private fun tr(fr: String): String {
        val (en, nl) = DATA[fr] ?: return fr
        return when (locale) { "en-US" -> en; "nl-NL" -> nl; else -> fr }
    }

    private val members = Fixtures.household.members.map {
        if (it.id == Fixtures.GRACE) it.copy(displayName = "Emma") else it.copy(displayName = "Tom")
    }
    private val cleaning = Fixtures.cleaning.copy(name = tr(Fixtures.cleaning.name))
    private val groceries = Fixtures.groceries.copy(name = tr(Fixtures.groceries.name))

    private val state = AgendaUiState(
        loaded = true,
        household = Fixtures.household.copy(name = "Emma & Tom", members = members),
        myMemberId = Fixtures.GRACE,
        occurrences = Fixtures.week().map { occ ->
            occ.copy(
                title = tr(occ.title),
                category = occ.category?.let { if (it.id == cleaning.id) cleaning else groceries },
            )
        },
        categories = listOf(cleaning, groceries),
        today = TODAY,
    )

    @Before fun onlyOnDemand() = assumeTrue(System.getProperty("roborazzi.test.record") == "true")

    private fun shot(name: String, dark: Boolean = false, content: @Composable () -> Unit) {
        compose.setContent {
            AgendaTheme(darkTheme = dark) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { content() }
            }
        }
        compose.onRoot().captureRoboImage("../fastlane/metadata/android/$locale/images/phoneScreenshots/$name.png")
    }

    @Test fun today() = shot("1_today") { TodayScreen(state, {}, {}, {}, {}) }

    @Test fun form() = shot("2_repeat") {
        val draft = TaskDraft(
            title = tr("Sortir les poubelles"), date = TODAY, startMinute = 1200, durationMinutes = 15,
            assigneeIds = listOf(Fixtures.NICOLAS, Fixtures.GRACE), syncToCalendar = true,
            recurrence = RecurrenceSpec(preset = RepeatPreset.WEEKLY, rotation = RotationKind.ALTERNATE),
        )
        TaskFormScreen(
            TaskFormState(loading = false, draft = draft, members = members),
            members, listOf(cleaning), calendarAvailable = true,
            onEdit = {}, onSave = {}, onDelete = {}, onConfirmDelete = {}, onScope = {}, onDismissDialogs = {}, onBack = {},
        )
    }

    @Test fun calendar() = shot("3_calendar") {
        CalendarScreen(state, YearMonth.from(TODAY), TODAY, {}, {}, {}, {}, {})
    }

    @Test fun tasks() = shot("4_tasks") { TasksScreen(state, Agenda.Filter(), {}, {}, {}, {}) }

    @Test fun shopping() = shot("5_shopping") {
        val items = listOf(
            ShoppingItem("1", tr("Tomates"), false, aisle = "PRODUCE"),
            ShoppingItem("2", tr("Bananes"), false, aisle = "PRODUCE"),
            ShoppingItem("3", tr("Baguette"), false, aisle = "BAKERY"),
            ShoppingItem("4", tr("Lait"), false, quantity = "x6", aisle = "DAIRY"),
            ShoppingItem("5", tr("Yaourts"), false, aisle = "DAIRY"),
            ShoppingItem("6", tr("Liquide vaisselle"), false, aisle = "HOUSEHOLD"),
            ShoppingItem("7", tr("Café"), true, Fixtures.NICOLAS, aisle = "PANTRY"),
            ShoppingItem("8", tr("Œufs"), true, Fixtures.GRACE, aisle = "DAIRY"),
        )
        ShoppingScreen(
            items = items, members = state.members, online = true, live = true, sync = SyncState(), refreshing = false,
            onRefresh = {}, onAdd = {}, onToggle = {}, onRemove = {}, onClearDone = {},
        )
    }

    @Test fun dark() = shot("6_dark", dark = true) { TodayScreen(state, {}, {}, {}, {}) }

    private companion object {
        /** Français → (anglais, néerlandais). */
        val DATA = mapOf(
            "Sortir les poubelles" to ("Take out the bins" to "Vuilnis buitenzetten"),
            "Nettoyer la salle de bain" to ("Clean the bathroom" to "Badkamer schoonmaken"),
            "Arroser les plantes" to ("Water the plants" to "Planten water geven"),
            "Courses de la semaine" to ("Weekly groceries" to "Weekboodschappen"),
            "Payer l'assurance auto" to ("Pay the car insurance" to "Autoverzekering betalen"),
            "Changer les draps" to ("Change the sheets" to "Bed verschonen"),
            "Appeler le plombier" to ("Call the plumber" to "Loodgieter bellen"),
            "Rendez-vous dentiste" to ("Dentist appointment" to "Afspraak tandarts"),
            "Ménage" to ("Cleaning" to "Schoonmaak"),
            "Courses" to ("Groceries" to "Boodschappen"),
            "Tomates" to ("Tomatoes" to "Tomaten"),
            "Bananes" to ("Bananas" to "Bananen"),
            "Baguette" to ("Baguette" to "Stokbrood"),
            "Lait" to ("Milk" to "Melk"),
            "Yaourts" to ("Yoghurt" to "Yoghurt"),
            "Liquide vaisselle" to ("Dish soap" to "Afwasmiddel"),
            "Café" to ("Coffee" to "Koffie"),
            "Œufs" to ("Eggs" to "Eieren"),
        )
    }
}

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "fr-rFR-w360dp-h720dp-xxhdpi")
class StoreScreenshotsFr : StoreScreenshots("fr-FR")

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "en-rUS-w360dp-h720dp-xxhdpi")
class StoreScreenshotsEn : StoreScreenshots("en-US")

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "nl-rNL-w360dp-h720dp-xxhdpi")
class StoreScreenshotsNl : StoreScreenshots("nl-NL")
