package app.tandem.foyer.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.ui.share.ShareSheet
import app.tandem.foyer.ui.share.noteFromShare
import app.tandem.foyer.ui.theme.AgendaTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/** « Partager → Tandem » : le choix (tâche, note, courses) et le titre de la note. */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "fr-rFR-w400dp-h860dp")
class ShareSheetTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun trois_choix() {
        val picked = mutableListOf<String>()
        compose.setContent {
            AgendaTheme {
                ShareSheet(
                    text = "lait, pain, œufs",
                    onTask = { picked += "task" },
                    onNote = { picked += "note" },
                    onShopping = { picked += "shopping" },
                    onDismiss = {},
                )
            }
        }
        compose.onNodeWithText("Ajouter à Tandem").assertIsDisplayed()
        compose.onNodeWithText("lait, pain, œufs").assertIsDisplayed()
        compose.onNodeWithText("En tâche").assertIsDisplayed()
        compose.onNodeWithText("En note").assertIsDisplayed()
        compose.onNodeWithText("Aux courses").performClick()
        assertEquals(listOf("shopping"), picked)
    }

    @Test
    fun titre_de_note() {
        // Le sujet (page web, e-mail) sert de titre ; le texte complet va dans la note.
        assertEquals("Recette" to "https://exemple.org/tarte", noteFromShare("https://exemple.org/tarte", "Recette"))
        // Sans sujet : la première ligne ; une ligne seule ne se répète pas dans le contenu.
        assertEquals("Code portail" to "Code portail\n4521", noteFromShare("Code portail\n4521", null))
        assertEquals("Acheter des bougies" to "", noteFromShare("  Acheter des bougies ", ""))
        val long = "a".repeat(80)
        assertEquals("a".repeat(59) + "…", noteFromShare(long, null).first)
    }
}
