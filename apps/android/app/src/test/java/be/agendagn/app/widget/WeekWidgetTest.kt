package be.agendagn.app.widget

import androidx.glance.appwidget.testing.unit.runGlanceAppWidgetUnitTest
import androidx.glance.testing.unit.hasText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import be.agendagn.app.testing.FakeAgendaRepository
import be.agendagn.app.testing.Fixtures
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.Clock
import java.time.ZoneId

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "fr-rFR")
class WeekWidgetTest {
    private val clock = Clock.fixed(Fixtures.TODAY.atTime(12, 0).atZone(ZoneId.of("Europe/Brussels")).toInstant(), ZoneId.of("UTC"))
    private val snapshot = runBlocking { WeekWidget.load(FakeAgendaRepository(), clock) }

    @Test
    fun `sept jours a partir d aujourd hui, groupes par jour, sans retard ni tache sans date`() {
        assertEquals(Fixtures.TODAY, snapshot.days.first().first)
        assertTrue(snapshot.days.all { (d, _) -> d >= Fixtures.TODAY && d <= Fixtures.TODAY.plusDays(6) })
        assertFalse(snapshot.days.flatMap { it.second }.any { it.title == "Payer l'assurance auto" })
    }

    @Test
    fun `affichage - titre, jours, taches`() = runGlanceAppWidgetUnitTest {
        setContext(ApplicationProvider.getApplicationContext())
        provideComposable { WeekWidgetContent(snapshot) }
        onNode(hasText("Semaine")).assertExists()
        onNode(hasText("Aujourd'hui")).assertExists()
        onNode(hasText("Sortir les poubelles")).assertExists()
    }

    @Test
    fun `deconnecte - message clair`() = runGlanceAppWidgetUnitTest {
        setContext(ApplicationProvider.getApplicationContext())
        provideComposable { WeekWidgetContent(WeekSnapshot(signedIn = false)) }
        onNode(hasText("Ouvrez l'app pour vous connecter.")).assertExists()
    }
}
