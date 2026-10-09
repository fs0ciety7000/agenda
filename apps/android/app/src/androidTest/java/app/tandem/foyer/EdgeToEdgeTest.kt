package app.tandem.foyer

import android.Manifest
import android.os.Build
import android.view.KeyEvent
import android.view.View
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.test.swipeUp
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import app.tandem.foyer.ui.navigation.BOTTOM_BAR_TAG
import app.tandem.foyer.ui.navigation.BottomBar
import app.tandem.foyer.ui.navigation.NavDrawer
import app.tandem.foyer.ui.navigation.drawerDestinations
import app.tandem.foyer.ui.theme.AgendaTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Bord à bord sur un vrai système (API 34 : activé par l'app ; API 35 : imposé par Android) :
 * l'app dessine sous les barres système, mais aucun texte ni bouton n'y passe.
 */
@RunWith(AndroidJUnit4::class)
class EdgeToEdgeTest {
    @get:Rule(order = 0)
    val notifications: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= 33) GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
        else GrantPermissionRule.grant()

    @get:Rule(order = 1)
    val compose = createAndroidComposeRule<MainActivity>()

    private fun text(id: Int) = compose.activity.getString(id)

    @Test
    fun connexion_dessineeSousLesBarres_sansRienCacher() {
        compose.waitUntil(15_000) {
            compose.onAllNodes(hasText(text(R.string.login_title))).fetchSemanticsNodes().isNotEmpty()
        }
        val decor = compose.activity.window.decorView
        val content = compose.activity.findViewById<View>(android.R.id.content)
        compose.runOnIdle {
            // Le contenu occupe tout l'écran, barres système comprises : c'est le bord à bord.
            assertEquals(decor.height, content.height)
        }
        val bars = systemBars(decor)
        val logo = compose.onNodeWithContentDescription(text(R.string.app_name)).screenBounds()
        val signIn = compose.onNodeWithText(text(R.string.sign_in)).screenBounds()
        assertTrue("logo sous la barre d'état", logo.top >= bars.top)
        assertTrue("bouton sous la barre de navigation", signIn.bottom <= decor.height - bars.bottom)
    }
}

/**
 * Barre du bas et tiroir « Plus » sur un vrai appareil : toucher « Plus » ou tirer la barre vers
 * le haut ouvre le tiroir, la touche retour le referme, et rien ne passe sous la barre de gestes.
 */
@RunWith(AndroidJUnit4::class)
class NavDrawerDeviceTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun text(id: Int) = compose.activity.getString(id)

    private fun showBar() {
        compose.runOnUiThread { WindowCompat.setDecorFitsSystemWindows(compose.activity.window, false) }
        compose.setContent {
            AgendaTheme {
                var open by remember { mutableStateOf(false) }
                Scaffold(bottomBar = { BottomBar(current = "today", onTab = {}, onMore = { open = true }) }) { padding ->
                    Box(Modifier.fillMaxSize().padding(padding))
                }
                if (open) {
                    NavDrawer(
                        destinations = drawerDestinations(withAbsences = true),
                        current = "today",
                        onOpen = { open = false },
                        onDismiss = { open = false },
                    )
                }
            }
        }
    }

    private fun drawerShown() = compose.onAllNodes(hasText(text(R.string.nav_settings))).fetchSemanticsNodes().isNotEmpty()

    private fun waitDrawer(shown: Boolean) = compose.waitUntil(5_000) { drawerShown() == shown }

    @Test
    fun plus_ouvreLeTiroir_auDessusDeLaBarreDeGestes_retourLeFerme() {
        showBar()
        val decor = compose.activity.window.decorView
        val bars = systemBars(decor)
        // Les libellés de la barre restent au-dessus de la barre de gestes.
        val label = compose.onNodeWithText(text(R.string.nav_today)).screenBounds()
        assertTrue("onglet sous la barre de navigation", label.bottom <= decor.height - bars.bottom)

        compose.onNodeWithText(text(R.string.nav_more)).performClick()
        waitDrawer(shown = true)
        compose.onNodeWithText(text(R.string.nav_settings)).assertIsDisplayed()
        val settings = compose.onNodeWithText(text(R.string.nav_settings)).screenBounds()
        assertTrue("tuile Réglages sous la barre de navigation", settings.bottom <= decor.height - bars.bottom)

        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        waitDrawer(shown = false)
    }

    @Test
    fun tirerLaBarreVersLeHaut_ouvreLeTiroir() {
        showBar()
        // Tirer vers le bas ne fait rien.
        compose.onNodeWithTag(BOTTOM_BAR_TAG).performTouchInput { swipeDown() }
        compose.waitForIdle()
        assertTrue(!drawerShown())
        compose.onNodeWithTag(BOTTOM_BAR_TAG).performTouchInput { swipeUp() }
        waitDrawer(shown = true)
        compose.onNodeWithText(text(R.string.nav_settings)).assertIsDisplayed()
    }
}

/** Marges des barres système (état et navigation), en pixels. */
private fun systemBars(decor: View) =
    ViewCompat.getRootWindowInsets(decor)!!.getInsets(WindowInsetsCompat.Type.systemBars())

/** Rectangle du nœud à l'écran, en pixels. */
private data class ScreenBounds(val top: Float, val bottom: Float)

private fun SemanticsNodeInteraction.screenBounds(): ScreenBounds {
    val node: SemanticsNode = fetchSemanticsNode()
    val top = node.positionOnScreen.y
    return ScreenBounds(top, top + node.size.height)
}
