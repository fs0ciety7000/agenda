package be.agendagn.app.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import be.agendagn.app.domain.Agenda
import be.agendagn.app.domain.RecurrenceSpec
import be.agendagn.app.domain.RepeatPreset
import be.agendagn.app.domain.RotationKind
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.testing.Fixtures
import be.agendagn.app.testing.Fixtures.TODAY
import be.agendagn.app.ui.calendar.CalendarScreen
import be.agendagn.app.ui.main.AgendaUiState
import be.agendagn.app.ui.taskform.TaskFormScreen
import be.agendagn.app.ui.taskform.TaskFormState
import be.agendagn.app.ui.tasks.TasksScreen
import be.agendagn.app.ui.theme.AgendaTheme
import be.agendagn.app.ui.today.TodayScreen
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
 */
abstract class StoreScreenshots(private val locale: String) {
    @get:Rule val compose = createComposeRule()

    private val state = AgendaUiState(
        loaded = true,
        household = Fixtures.household,
        myMemberId = Fixtures.GRACE,
        occurrences = Fixtures.week(),
        categories = listOf(Fixtures.cleaning, Fixtures.groceries),
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
            title = "Sortir les poubelles", date = TODAY, startMinute = 1200, durationMinutes = 15,
            assigneeIds = listOf(Fixtures.NICOLAS, Fixtures.GRACE), syncToCalendar = true,
            recurrence = RecurrenceSpec(preset = RepeatPreset.WEEKLY, rotation = RotationKind.ALTERNATE),
        )
        TaskFormScreen(
            TaskFormState(loading = false, draft = draft, members = Fixtures.household.members),
            Fixtures.household.members, listOf(Fixtures.cleaning), calendarAvailable = true,
            onEdit = {}, onSave = {}, onDelete = {}, onConfirmDelete = {}, onScope = {}, onDismissDialogs = {}, onBack = {},
        )
    }

    @Test fun calendar() = shot("3_calendar") {
        CalendarScreen(state, YearMonth.from(TODAY), TODAY, {}, {}, {}, {}, {})
    }

    @Test fun tasks() = shot("4_tasks") { TasksScreen(state, Agenda.Filter(), {}, {}, {}, {}) }

    @Test fun dark() = shot("5_dark", dark = true) { TodayScreen(state, {}, {}, {}, {}) }
}

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "fr-rFR-w360dp-h720dp-xxhdpi")
class StoreScreenshotsFr : StoreScreenshots("fr-FR")

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "en-rUS-w360dp-h720dp-xxhdpi")
class StoreScreenshotsEn : StoreScreenshots("en-US")
