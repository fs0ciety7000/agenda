package be.agendagn.app

import android.Manifest
import android.os.Build
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Premier lancement sur un vrai appareil : l'app démarre (Room, WorkManager, DataStore chiffré
 * par le Keystore Android…) et affiche la connexion. Sans serveur joignable, une tentative de
 * connexion affiche l'erreur réseau au lieu de planter.
 */
@RunWith(AndroidJUnit4::class)
class LaunchTest {
    /** Pas de fenêtre système « Autoriser les notifications ? » par-dessus l'écran testé. */
    @get:Rule(order = 0)
    val notifications: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= 33) GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
        else GrantPermissionRule.grant()

    @get:Rule(order = 1)
    val compose = createAndroidComposeRule<MainActivity>()

    private fun text(id: Int) = compose.activity.getString(id)

    @Test
    fun connexionAffichee_puisErreurReseau() {
        compose.waitUntil(15_000) {
            compose.onAllNodes(hasText(text(R.string.login_title))).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText(text(R.string.login_title)).assertIsDisplayed()
        compose.onNodeWithText(text(R.string.email)).performTextInput("grace@example.test")
        compose.onNodeWithText(text(R.string.password)).performTextInput("correct horse battery")
        compose.onNodeWithText(text(R.string.sign_in)).performClick()
        compose.waitUntil(30_000) {
            compose.onAllNodes(hasText(text(R.string.error_network))).fetchSemanticsNodes().isNotEmpty()
        }
    }
}
