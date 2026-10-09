package app.tandem.foyer.ui

import androidx.compose.material3.Surface
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.padding
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
import app.tandem.foyer.data.ReminderSettings
import app.tandem.foyer.domain.Agenda
import app.tandem.foyer.domain.model.CalendarLinkState
import app.tandem.foyer.domain.model.CalendarStatus
import app.tandem.foyer.domain.model.User
import app.tandem.foyer.domain.repository.SyncState
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.testing.Fixtures.TODAY
import app.tandem.foyer.notifications.PushState
import app.tandem.foyer.ui.calendar.CalendarScreen
import app.tandem.foyer.ui.main.AgendaUiState
import app.tandem.foyer.ui.settings.SettingsScreen
import app.tandem.foyer.ui.taskform.TaskFormScreen
import app.tandem.foyer.ui.taskform.TaskFormState
import app.tandem.foyer.ui.tasks.TasksScreen
import app.tandem.foyer.ui.theme.AgendaTheme
import app.tandem.foyer.ui.today.TodayScreen
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
        compose.onNodeWithText("À RATTRAPER").assertIsDisplayed()
        compose.onNodeWithText("1 sur 3 faites").assertIsDisplayed()
        compose.onNodeWithContentDescription("Marquer « Sortir les poubelles » comme faite").performClick()
        assertEquals(listOf("Sortir les poubelles"), toggled)
        shot("today")
    }

    @Test
    fun aujourdhui_qui_fait_quoi() {
        screen { TodayScreen(state, {}, {}, {}, {}) }
        compose.onNodeWithText("QUI FAIT QUOI").performScrollTo().assertIsDisplayed()
        compose.onNodeWithContentDescription("Grace, Mardi 29 septembre : 2 tâches").performScrollTo().performClick()
        compose.onNodeWithText("Grace · Mardi 29 septembre").performScrollTo().assertIsDisplayed()
        compose.onNodeWithContentDescription("Nicolas, Jeudi 1 octobre : rien").assertExists()
        shot("today-board")
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
        val draft = app.tandem.foyer.domain.model.TaskDraft(
            title = "Sortir les poubelles", date = TODAY, startMinute = 1200, durationMinutes = 15,
            assigneeIds = listOf(Fixtures.NICOLAS, Fixtures.GRACE), syncToCalendar = true,
            recurrence = app.tandem.foyer.domain.RecurrenceSpec(
                preset = app.tandem.foyer.domain.RepeatPreset.WEEKLY,
                rotation = app.tandem.foyer.domain.RotationKind.ALTERNATE,
            ),
        )
        screen {
            TaskFormScreen(
                TaskFormState(loading = false, draft = draft, members = Fixtures.household.members), Fixtures.household.members, listOf(Fixtures.cleaning),
                calendarAvailable = true, onEdit = {}, onSave = {}, onDelete = {}, onConfirmDelete = {}, onScope = {},
                onDismissDialogs = {}, onBack = {},
            )
        }
        compose.onNodeWithText("Chacun son tour").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Commence par").performScrollTo().assertIsDisplayed()
        shot("task-form")
        compose.onNodeWithText("Ajouter au calendrier partagé").performScrollTo().assertIsDisplayed()
        compose.onNode(hasText("Ajouter au calendrier partagé") and isToggleable()).assertIsOn()
    }

    @Test
    fun formulaire_suggestion_de_repartition() {
        val edits = mutableListOf<app.tandem.foyer.domain.model.TaskDraft>()
        val draft = app.tandem.foyer.domain.model.TaskDraft(title = "Sortir les poubelles", date = TODAY)
        val nicolas = Fixtures.household.members.first { it.id == Fixtures.NICOLAS }
        screen {
            TaskFormScreen(
                TaskFormState(loading = false, draft = draft), Fixtures.household.members, emptyList(),
                calendarAvailable = false, onEdit = { edits += it(draft) }, onSave = {}, onDelete = {},
                onConfirmDelete = {}, onScope = {}, onDismissDialogs = {}, onBack = {},
                suggestion = nicolas to app.tandem.foyer.domain.Agenda.Share(1, 10),
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
                app.tandem.foyer.domain.model.ChecklistItem("i1", "Lait", done = true),
                app.tandem.foyer.domain.model.ChecklistItem("i2", "Pain", done = false),
            ),
        )
        val toggled = mutableListOf<String>()
        val added = mutableListOf<String>()
        screen {
            TaskFormScreen(
                TaskFormState(loading = false, original = o, draft = app.tandem.foyer.domain.TaskPayloads.draftOf(o), checklist = o.checklist),
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
    @Config(qualifiers = "fr-rFR-w360dp-h860dp-xxhdpi", fontScale = 2f)
    fun qui_fait_quoi_police_200() {
        // Petit écran et police à 200 % : jours en une lettre, aucune case coupée.
        screen {
            androidx.compose.foundation.layout.Column(Modifier.padding(androidx.compose.ui.unit.Dp(16f))) {
                app.tandem.foyer.ui.today.WeekBoard(
                    app.tandem.foyer.domain.Agenda.weekBoard(state.occurrences, state.today, Fixtures.household.members),
                    Fixtures.household.members,
                ) { _, _, _ -> }
            }
        }
        compose.onNodeWithText("QUI FAIT QUOI").assertIsDisplayed()
        shot("board-font-200")
    }

    @Test
    @Config(qualifiers = "fr-rFR-w400dp-h860dp-xxhdpi", fontScale = 2f)
    fun aujourdhui_police_200() {
        // Police système à 200 % : les lignes passent à la ligne, rien n'est coupé.
        screen { TodayScreen(state, {}, {}, {}, {}) }
        compose.onNodeWithText("Bonjour Grace 👋").assertIsDisplayed()
        compose.onNodeWithText("Nettoyer la salle de bain").assertIsDisplayed()
        shot("today-font-200")
    }

    @Test
    fun plus_sombre() {
        screen(dark = true) {
            SettingsScreen(
                state, User("u", "grace@example.be", "Grace"),
                CalendarStatus(CalendarLinkState.ACTIVE, "Commun G & N", "foyer@example.be", null, 12, 0, 0),
                ReminderSettings(true, 15), notificationsAllowed = true, version = "0.2.0",
                onReminders = {}, onRequestNotifications = {}, onOpenWeb = {}, onSignOut = {},
                push = PushState.Registered,
            )
        }
        compose.onNodeWithText("Réglages").assertIsDisplayed()
        shot("more-dark")
    }

    @Test
    fun tiroir_plus() {
        val opened = mutableListOf<String>()
        screen {
            app.tandem.foyer.ui.navigation.NavDrawer(
                destinations = app.tandem.foyer.ui.navigation.drawerDestinations(withAbsences = true),
                current = "settings",
                onOpen = { opened += it },
                onDismiss = {},
            )
        }
        compose.onNodeWithText("Plus").assertIsDisplayed()
        listOf("Dépenses", "Notes", "Dates importantes", "Journal et corbeille", "Absences", "Aide", "Réglages")
            .forEach { compose.onNodeWithText(it).assertIsDisplayed() }
        shot("nav-drawer")
        compose.onNodeWithText("Notes").performClick()
        assertEquals(listOf("notes"), opened)
    }

    /** Les six illustrations d'états vides (même tracé que le site), en clair et en sombre. */
    private fun etatsVides(dark: Boolean) {
        screen(dark) {
            androidx.compose.foundation.layout.Column(
                Modifier.verticalScroll(androidx.compose.foundation.rememberScrollState()),
            ) {
                listOf(
                    app.tandem.foyer.R.drawable.ill_empty_today to "Rien pour aujourd'hui.",
                    app.tandem.foyer.R.drawable.ill_empty_shopping to "La liste est vide.",
                    app.tandem.foyer.R.drawable.ill_empty_meals to "Aucun repas prévu.",
                    app.tandem.foyer.R.drawable.ill_empty_expenses to "Aucune dépense ce mois-ci.",
                    app.tandem.foyer.R.drawable.ill_empty_notes to "Aucune note pour l'instant.",
                    app.tandem.foyer.R.drawable.ill_empty_dates to "Aucune date pour l'instant.",
                ).chunked(2).forEach { row ->
                    androidx.compose.foundation.layout.Row {
                        row.forEach { (ill, title) ->
                            androidx.compose.foundation.layout.Box(Modifier.weight(1f)) {
                                app.tandem.foyer.ui.components.EmptyState(title, illustration = ill)
                            }
                        }
                    }
                }
            }
        }
        // Titre lu par TalkBack (l'illustration est décorative).
        compose.onNodeWithContentDescription("Rien pour aujourd'hui.").assertIsDisplayed()
        shot(if (dark) "empty-states-dark" else "empty-states")
    }

    @Test
    fun etats_vides() = etatsVides(dark = false)

    @Test
    fun etats_vides_sombre() = etatsVides(dark = true)

    @Test
    fun mode_magasin() {
        val toggled = mutableListOf<String>()
        val items = listOf(
            app.tandem.foyer.domain.model.ShoppingItem("i1", "Tomates", done = false, aisle = "PRODUCE"),
            app.tandem.foyer.domain.model.ShoppingItem("i2", "Lait", done = true, aisle = "DAIRY"),
        )
        screen { app.tandem.foyer.ui.shopping.StoreMode(items, { toggled += it.text }, {}) }
        compose.onNodeWithText("Au magasin").assertIsDisplayed()
        compose.onNodeWithText("Encore 1 article").assertIsDisplayed()
        compose.onNodeWithText("Tomates").performClick()
        assertEquals(listOf("Tomates"), toggled)
    }

    @Test
    fun reglages() {
        screen {
            SettingsScreen(
                state, User("u", "grace@example.be", "Grace"),
                CalendarStatus(CalendarLinkState.ACTIVE, "Commun G & N", "foyer@example.be", null, 12, 0, 0),
                ReminderSettings(true, 15), notificationsAllowed = true, version = "0.2.0",
                onReminders = {}, onRequestNotifications = {}, onOpenWeb = {}, onSignOut = {},
                push = PushState.Registered,
            )
        }
        // Les pages du foyer sont dans le tiroir « Plus » : l'écran commence par les réglages.
        compose.onNodeWithText("Réglages").assertIsDisplayed()
        compose.onNodeWithText("Qui a payé quoi, et qui doit combien.").assertDoesNotExist()
        compose.onNodeWithText("✓ Synchronisé avec « Commun G & N »").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Actives : ce téléphone est enregistré.", substring = true).performScrollTo().assertIsDisplayed()
        shot("settings")
    }

    @Test
    fun courses_ajout_coche_et_panier() {
        val added = mutableListOf<List<String>>()
        val toggled = mutableListOf<String>()
        screen {
            app.tandem.foyer.ui.shopping.ShoppingScreen(
                items = listOf(
                    app.tandem.foyer.domain.model.ShoppingItem("1", "Lait", false),
                    app.tandem.foyer.domain.model.ShoppingItem("2", "Pain", true, Fixtures.NICOLAS),
                ),
                members = state.members, online = true, live = true, sync = SyncState(), refreshing = false,
                onRefresh = {}, onAdd = { added += it }, onToggle = { toggled += it.text }, onRemove = {}, onClearDone = {},
            )
        }
        compose.onNodeWithText("En direct").assertIsDisplayed()
        compose.onNodeWithText("À ACHETER (1)").assertIsDisplayed()
        compose.onNodeWithText("Pris par Nicolas").assertIsDisplayed()
        compose.onNodeWithText("Ajouter à la liste").performTextInput("Œufs, beurre")
        compose.onNodeWithContentDescription("Ajouter à la liste").performClick()
        assertEquals(listOf(listOf("Œufs", "beurre")), added)
        compose.onNodeWithText("Lait").performClick()
        assertEquals(listOf("Lait"), toggled)
        shot("shopping")
    }

    @Test
    fun ajout_rapide_depuis_un_modele() {
        val applied = mutableListOf<Pair<String, java.time.LocalDate?>>()
        var dictated = 0
        val template = app.tandem.foyer.domain.model.TaskTemplate("t1", "Ménage du samedi", "🧹", listOf("Aspirateur", "Salle de bain"))
        screen {
            app.tandem.foyer.ui.quickadd.QuickAddSheet(
                state = app.tandem.foyer.ui.main.QuickAddState(), online = true, members = state.members, today = TODAY,
                onText = {}, onSubmit = {}, onFullForm = {}, onDismiss = {},
                templates = listOf(template), onApplyTemplate = { t, d -> applied += t.id to d },
                onVoice = { dictated++ },
            )
        }
        compose.onNodeWithContentDescription("Dicter la tâche").performClick()
        assertEquals(1, dictated)
        compose.onNodeWithText("🧹 Ménage du samedi").performClick()
        compose.onNodeWithText("Aspirateur · Salle de bain").assertIsDisplayed()
        compose.onNodeWithText("Demain").performClick()
        compose.onNodeWithText("Créer les 2 tâches").performClick()
        assertEquals(listOf("t1" to TODAY.plusDays(1)), applied)
    }
}
