package app.tandem.foyer.widget

import androidx.glance.appwidget.testing.unit.runGlanceAppWidgetUnitTest
import androidx.glance.testing.unit.hasContentDescription
import androidx.glance.testing.unit.hasText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.domain.model.ShoppingItem
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "fr-rFR")
class ShoppingWidgetTest {
    @Test
    fun `articles a acheter, cases accessibles, nombre dans le titre`() = runGlanceAppWidgetUnitTest {
        setContext(ApplicationProvider.getApplicationContext())
        provideComposable {
            ShoppingWidgetContent(true, listOf(ShoppingItem("1", "Lait", false), ShoppingItem("2", "Pain", false)))
        }
        onNode(hasText("Courses (2)")).assertExists()
        onNode(hasContentDescription("Lait")).assertExists()
        onNode(hasText("Pain")).assertExists()
        onNode(hasContentDescription("Ajouter à la liste")).assertExists()
    }

    @Test
    fun `liste vide ou deconnecte - message clair`() = runGlanceAppWidgetUnitTest {
        setContext(ApplicationProvider.getApplicationContext())
        provideComposable { ShoppingWidgetContent(true, emptyList()) }
        onNode(hasText("Rien à acheter.")).assertExists()
    }
}
