package be.agendagn.app.ui

import androidx.compose.material3.Surface
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.test.ext.junit.runners.AndroidJUnit4
import be.agendagn.app.data.ReminderSettings
import be.agendagn.app.domain.Agenda
import be.agendagn.app.domain.model.CalendarLinkState
import be.agendagn.app.domain.model.CalendarStatus
import be.agendagn.app.domain.model.User
import be.agendagn.app.domain.repository.SyncState
import be.agendagn.app.testing.Fixtures
import be.agendagn.app.testing.Fixtures.TODAY
import be.agendagn.app.ui.calendar.CalendarScreen
import be.agendagn.app.ui.main.AgendaUiState
import be.agendagn.app.ui.settings.SettingsScreen
import be.agendagn.app.ui.taskform.TaskFormScreen
import be.agendagn.app.ui.taskform.TaskFormState
import be.agendagn.app.ui.tasks.TasksScreen
import be.agendagn.app.ui.theme.AgendaTheme
import be.agendagn.app.ui.today.TodayScreen
import com.github.takahirom.roborazzi.captureRoboImage
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performCustomAccessibilityActionWithLabel
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.performTextInput
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.YearMonth

/**
 * Écrans réels, rendus sur la JVM (Robolectric) : comportement + accessibilité.
 * Captures (docs/screenshots/android) : ./gradlew testDebugUnitTest -Pscreenshots
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "fr-rFR-w400dp-h860dp-xxhdpi")
class ScreensTest {
    @get:Rule val compose = createComposeRule()

    private val state = AgendaUiState(
        loaded = true,
        household = Fixtures.household,
        myMemberId = Fixtures.GRACE,
        occurrences = Fixtures.week(),
        categories = listOf(Fixtures.cleaning, Fixtures.groceries),
        today = TODAY,
    )

    private fun screen(dark: Boolean = false, content: @Composable () -> Unit) = compose.setContent {
        AgendaTheme(darkTheme = dark) {
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { content() }
        }
    }

    private fun shot(name: String) = compose.onRoot().captureRoboImage("../../../docs/screenshots/android/$name.png")

    @Test
    fun aujourdhui_sections_et_coche() {
        val toggled = mutableListOf<String>()
        screen { TodayScreen(state, {}, { toggled += it.title }, {}, {}) }
        compose.onNodeWithText("Bonjour Grace 👋").assertIsDisplayed()
        compose.onNodeWithText("EN RETARD").assertIsDisplayed()
        compose.onNodeWithText("1 sur 3 faites").assertIsDisplayed()
        compose.onNodeWithContentDescription("Marquer « Sortir les poubelles » comme faite").performClick()
        assertEquals(listOf("Sortir les poubelles"), toggled)
        shot("today")
    }

    @Test
    fun aujourdhui_hors_ligne_sombre() {
        screen(dark = true) { TodayScreen(state.copy(online = false, sync = SyncState(pending = 2)), {}, {}, {}, {}) }
        compose.onNodeWithText("Hors ligne · 2 modifications en attente").assertIsDisplayed()
        shot("today-offline-dark")
    }

    @Test
    fun taches_filtres() {
        screen {
            var filter by remember { mutableStateOf(Agenda.Filter()) }
            TasksScreen(state, filter, { filter = it }, {}, {}, {})
        }
        compose.onNodeWithText("Appeler le plombier").assertIsDisplayed()
        compose.onNodeWithText("Faites").performClick()
        compose.onNodeWithText("Arroser les plantes").assertIsDisplayed()
        compose.onNodeWithText("À faire").performClick()
        shot("tasks")
    }

    @Test
    fun calendrier_mois_et_jour() {
        var selected = TODAY
        screen {
            var day by remember { mutableStateOf(TODAY) }
            CalendarScreen(state, YearMonth.from(TODAY), day, {}, { day = it; selected = it }, {}, {}, {})
        }
        compose.onNodeWithText("Septembre 2026").assertIsDisplayed()
        // Jour lisible par un lecteur d'écran : date + nombre de tâches.
        compose.onNodeWithContentDescription("Jeudi 1 octobre, 1 tâche").performClick()
        assertEquals(TODAY.plusDays(2), selected)
        compose.onNodeWithText("Courses de la semaine").assertIsDisplayed()
        shot("calendar")
    }

    @Test
    @OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)
    fun calendrier_glisser_deposer_et_actions_talkback() {
        val moves = mutableListOf<Pair<String, java.time.LocalDate>>()
        screen {
            CalendarScreen(
                state, YearMonth.from(TODAY), TODAY, {}, {}, {}, {}, {},
                onMove = { o, d -> moves += o.title to d },
            )
        }
        val task = compose.onNodeWithText("Nettoyer la salle de bain")
        val from = task.fetchSemanticsNode().boundsInRoot
        val to = compose.onNodeWithContentDescription("Jeudi 1 octobre, 1 tâche").fetchSemanticsNode().boundsInRoot
        task.performTouchInput {
            down(center)
            advanceEventTime(1_000) // appui long
            moveBy(Offset(0f, -20f))
            moveTo(Offset(to.center.x - from.left, to.center.y - from.top))
            up()
        }
        compose.waitForIdle()
        assertEquals(listOf("Nettoyer la salle de bain" to TODAY.plusDays(2)), moves)

        // Alternative sans geste (TalkBack) : actions personnalisées sur la tâche.
        compose.onNode(
            SemanticsMatcher.keyIsDefined(SemanticsActions.CustomActions) and
                hasAnyDescendant(hasText("Sortir les poubelles")),
        ).performCustomAccessibilityActionWithLabel("Déplacer au jour suivant")
        assertEquals("Sortir les poubelles" to TODAY.plusDays(1), moves.last())
    }

    @Test
    fun formulaire_creation() {
        val draft = be.agendagn.app.domain.model.TaskDraft(
            title = "Sortir les poubelles", date = TODAY, startMinute = 1200, durationMinutes = 15,
            assigneeIds = listOf(Fixtures.NICOLAS, Fixtures.GRACE), repeat = be.agendagn.app.domain.model.Repeat.WEEKLY,
            alternate = true, syncToCalendar = true,
        )
        screen {
            TaskFormScreen(
                TaskFormState(loading = false, draft = draft), Fixtures.household.members, listOf(Fixtures.cleaning),
                calendarAvailable = true, onEdit = {}, onSave = {}, onDelete = {}, onConfirmDelete = {}, onScope = {},
                onDismissDialogs = {}, onBack = {},
            )
        }
        compose.onNodeWithText("Chacun son tour").assertIsDisplayed()
        shot("task-form")
        compose.onNodeWithText("Ajouter au calendrier partagé").performScrollTo().assertIsDisplayed()
        compose.onNode(hasText("Ajouter au calendrier partagé") and isToggleable()).assertIsOn()
    }

    @Test
    fun formulaire_suggestion_de_repartition() {
        val edits = mutableListOf<be.agendagn.app.domain.model.TaskDraft>()
        val draft = be.agendagn.app.domain.model.TaskDraft(title = "Sortir les poubelles", date = TODAY)
        val nicolas = Fixtures.household.members.first { it.id == Fixtures.NICOLAS }
        screen {
            TaskFormScreen(
                TaskFormState(loading = false, draft = draft), Fixtures.household.members, emptyList(),
                calendarAvailable = false, onEdit = { edits += it(draft) }, onSave = {}, onDelete = {},
                onConfirmDelete = {}, onScope = {}, onDismissDialogs = {}, onBack = {},
                suggestion = nicolas to be.agendagn.app.domain.Agenda.Share(1, 10),
            )
        }
        compose.onNodeWithText("Suggestion : Nicolas, la moins chargée cette semaine (1 tâche).").assertIsDisplayed()
        compose.onNodeWithText("Confier à Nicolas").performClick()
        assertEquals(listOf(Fixtures.NICOLAS), edits.last().assigneeIds)
    }

    @Test
    fun formulaire_liste_de_courses() {
        val o = Fixtures.week().first().copy(
            title = "Courses",
            checklist = listOf(
                be.agendagn.app.domain.model.ChecklistItem("i1", "Lait", done = true),
                be.agendagn.app.domain.model.ChecklistItem("i2", "Pain", done = false),
            ),
        )
        val toggled = mutableListOf<String>()
        val added = mutableListOf<String>()
        screen {
            TaskFormScreen(
                TaskFormState(loading = false, original = o, draft = be.agendagn.app.domain.TaskPayloads.draftOf(o), checklist = o.checklist),
                Fixtures.household.members, emptyList(), calendarAvailable = false, onEdit = {}, onSave = {},
                onDelete = {}, onConfirmDelete = {}, onScope = {}, onDismissDialogs = {}, onBack = {},
                onAddItem = { added += it }, onToggleItem = { toggled += it.id },
            )
        }
        compose.onNodeWithText("1 sur 2").performScrollTo().assertIsDisplayed()
        compose.onNodeWithContentDescription("Pain").performScrollTo().performClick()
        assertEquals(listOf("i2"), toggled)
        compose.onNodeWithText("Ajouter un élément (ex. lait, pain…)").performScrollTo().performTextInput("Café")
        compose.onNodeWithContentDescription("Mettre dans la liste").performClick()
        assertEquals(listOf("Café"), added)
        compose.onNodeWithContentDescription("Retirer « Lait »").assertExists()
    }

    @Test
    fun reglages() {
        screen {
            SettingsScreen(
                state, User("u", "grace@example.be", "Grace"),
                CalendarStatus(CalendarLinkState.ACTIVE, "Commun G & N", "foyer@example.be", null, 12, 0, 0),
                ReminderSettings(true, 15), notificationsAllowed = true, version = "0.2.0",
                onReminders = {}, onRequestNotifications = {}, onOpenWeb = {}, onSignOut = {},
            )
        }
        compose.onNodeWithText("✓ Synchronisé avec « Commun G & N »").assertIsDisplayed()
        shot("settings")
    }
}
