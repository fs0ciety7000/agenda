package be.agendagn.app.widget

import androidx.glance.appwidget.testing.unit.runGlanceAppWidgetUnitTest
import androidx.glance.testing.unit.hasContentDescription
import androidx.glance.testing.unit.hasText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import be.agendagn.app.testing.FakeAgendaRepository
import be.agendagn.app.testing.Fixtures
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.Clock
import java.time.ZoneId

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "fr-rFR")
class TodayWidgetTest {
    private val repository = FakeAgendaRepository()
    private val clock = Clock.fixed(Fixtures.TODAY.atTime(12, 0).atZone(ZoneId.of("Europe/Brussels")).toInstant(), ZoneId.of("UTC"))
    // Les fixtures sont relatives à « aujourd'hui » dans le fuseau du foyer.
    private val snapshot = runBlocking { TodayWidget.load(repository, clock) }

    @Test
    fun `instantane - en retard puis du jour, progression`() {
        assertEquals(listOf("Payer l'assurance auto"), snapshot.overdue.map { it.title })
        assertEquals(3, snapshot.today.size)
        assertEquals(1, snapshot.done)
    }

    @Test
    fun `affichage - titre, progression, retard, case accessible, ajout rapide`() = runGlanceAppWidgetUnitTest {
        setContext(ApplicationProvider.getApplicationContext())
        provideComposable { TodayWidgetContent(snapshot) }
        onNode(hasText("Aujourd'hui")).assertExists()
        onNode(hasText("1 sur 3 faites")).assertExists()
        onNode(hasText("Payer l'assurance auto")).assertExists()
        onNode(hasText("En retard")).assertExists()
        onNode(hasContentDescription("Marquer « Sortir les poubelles » comme faite")).assertExists()
        onNode(hasContentDescription("Ajout rapide")).assertExists()
    }

    @Test
    fun `deconnecte ou journee vide - message clair`() = runGlanceAppWidgetUnitTest {
        setContext(ApplicationProvider.getApplicationContext())
        provideComposable { TodayWidgetContent(TodaySnapshot(signedIn = false)) }
        onNode(hasText("Ouvrez l'app pour vous connecter.")).assertExists()
    }

    @Test
    fun `sans foyer - non connecte`() {
        val empty = runBlocking { TodayWidget.load(FakeAgendaRepository(household = null)) }
        assertFalse(empty.signedIn)
    }

    @Test
    fun `journee vide`() = runGlanceAppWidgetUnitTest {
        setContext(ApplicationProvider.getApplicationContext())
        provideComposable { TodayWidgetContent(TodaySnapshot(signedIn = true, members = Fixtures.household.members.associateBy { it.id })) }
        onNode(hasText("Rien pour aujourd'hui 🎉")).assertExists()
    }
}
