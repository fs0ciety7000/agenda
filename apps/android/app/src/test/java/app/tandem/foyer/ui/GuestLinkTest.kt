package app.tandem.foyer.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.remote.GuestShoppingLinkDto
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.ui.shopping.GuestLinkButton
import app.tandem.foyer.ui.theme.AgendaTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/** Lien invité des courses : créé, signalé comme actif (pas seulement par la couleur), coupé. */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "fr-rFR-w400dp-h860dp")
class GuestLinkTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun lien_invite_cree_puis_coupe() {
        var server = GuestShoppingLinkDto()
        var revoked = 0
        val createdWith = mutableListOf<Int?>()
        val messages = mutableListOf<String>()
        compose.setContent {
            AgendaTheme {
                GuestLinkButton(
                    online = true,
                    householdName = "Emma & Tom",
                    members = mapOf(Fixtures.GRACE to Fixtures.grace),
                    load = { server },
                    create = { days ->
                        createdWith += days
                        GuestShoppingLinkDto(
                            "https://tandem.test/guest/abc",
                            "2026-10-09T10:00:00Z",
                            Fixtures.GRACE,
                            expiresAt = "2026-10-16T10:00:00Z",
                        ).also { server = it }
                    },
                    revoke = {
                        revoked++
                        server = GuestShoppingLinkDto()
                        true
                    },
                    onMessage = { messages += it },
                )
            }
        }
        compose.onNodeWithText("Partager avec un invité").performClick()
        compose.onNodeWithText("Créer le lien").performClick()
        compose.onNodeWithText("https://tandem.test/guest/abc").assertIsDisplayed()
        compose.onNodeWithText("Créé le 9 octobre 2026 par Grace").assertIsDisplayed()
        // Une semaine par défaut ; la date de coupure est affichée.
        assertEquals(listOf<Int?>(7), createdWith)
        compose.onNodeWithText("Se coupe tout seul le", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Fermer").performClick()
        compose.onNodeWithContentDescription("Partager avec un invité, Lien invité actif").assertIsDisplayed()

        compose.onNodeWithContentDescription("Partager avec un invité, Lien invité actif").performClick()
        compose.onNodeWithText("Couper le lien").performClick()
        compose.onNodeWithText("Couper le lien ? L'invité ne verra plus la liste.").assertIsDisplayed()
        // Le bouton de la confirmation (au-dessus de la fenêtre du lien).
        compose.onAllNodesWithText("Couper le lien").onLast().performClick()
        compose.waitUntil { compose.onAllNodes(androidx.compose.ui.test.hasText("Créer le lien")).fetchSemanticsNodes().isNotEmpty() }
        assertEquals(1, revoked)
        assertEquals(emptyList<String>(), messages)
    }

    @Test
    fun hors_ligne_le_bouton_le_dit() {
        val messages = mutableListOf<String>()
        compose.setContent {
            AgendaTheme {
                GuestLinkButton(false, "Emma & Tom", emptyMap(), { null }, { _ -> null }, { false }, { messages += it })
            }
        }
        compose.onNodeWithText("Partager avec un invité").performClick()
        assertEquals(listOf("Partager la liste demande une connexion."), messages)
    }
}
