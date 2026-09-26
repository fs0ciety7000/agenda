package be.agendagn.app.domain

import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.testing.Fixtures
import be.agendagn.app.testing.Fixtures.GRACE
import be.agendagn.app.testing.Fixtures.NICOLAS
import be.agendagn.app.testing.Fixtures.TODAY
import be.agendagn.app.testing.Fixtures.occ
import org.junit.Assert.assertEquals
import org.junit.Test

class AgendaTest {
    @Test
    fun `sections du jour - retards, aujourd hui (faites en dernier), 7 jours, sans date`() {
        val s = Agenda.todaySections(Fixtures.week(), TODAY)
        assertEquals(listOf("Payer l'assurance auto"), s.overdue.map { it.title })
        assertEquals(
            listOf("Nettoyer la salle de bain", "Sortir les poubelles", "Arroser les plantes"),
            s.today.map { it.title },
        )
        assertEquals(1, s.todayDone)
        assertEquals(
            listOf("Rendez-vous dentiste", "Courses de la semaine", "Changer les draps"),
            s.upcoming.map { it.title },
        )
        assertEquals(1, s.unscheduledCount)
    }

    @Test
    fun `annulees et sautees n apparaissent jamais`() {
        val all = listOf(
            occ("Annulée", status = OccurrenceStatus.CANCELLED),
            occ("Sautée", status = OccurrenceStatus.SKIPPED),
        )
        assertEquals(0, Agenda.todaySections(all, TODAY).today.size)
        assertEquals(0, Agenda.filter(all, Agenda.Filter(Agenda.View.DONE), TODAY, GRACE).size)
    }

    @Test
    fun `filtres - vues, les miennes, recherche insensible a la casse`() {
        val all = Fixtures.week()
        fun titles(f: Agenda.Filter, me: String = GRACE) = Agenda.filter(all, f, TODAY, me).map { it.title }
        assertEquals(
            listOf("Payer l'assurance auto", "Nettoyer la salle de bain", "Sortir les poubelles", "Appeler le plombier"),
            titles(Agenda.Filter(Agenda.View.TODO)),
        )
        assertEquals(listOf("Appeler le plombier"), titles(Agenda.Filter(Agenda.View.UNSCHEDULED)))
        assertEquals(listOf("Arroser les plantes"), titles(Agenda.Filter(Agenda.View.DONE)))
        assertEquals(
            listOf("Rendez-vous dentiste", "Courses de la semaine"),
            titles(Agenda.Filter(Agenda.View.UPCOMING, Agenda.Who.ME)),
        )
        assertEquals(listOf("Sortir les poubelles"), titles(Agenda.Filter(Agenda.View.TODO, query = "POUBELLES")))
        assertEquals(listOf("Payer l'assurance auto", "Sortir les poubelles"), titles(Agenda.Filter(who = Agenda.Who.ME), NICOLAS))
    }

    @Test
    fun `repartition de la semaine - partagees uniquement, a deux et a definir a part`() {
        val b = Agenda.weekBalance(Fixtures.week(), TODAY, Fixtures.household.members)
        assertEquals(TODAY.minusDays(1), b.from) // lundi
        assertEquals(TODAY.plusDays(5), b.to) // dimanche
        val byName = b.members.associate { it.first.displayName to it.second }
        // Grace : salle de bain (45) + plantes ; la tâche personnelle n'est jamais comptée.
        assertEquals(Agenda.Share(2, 45), byName["Grace"])
        // Nicolas : poubelles ; l'assurance (dimanche dernier) est hors de la semaine.
        assertEquals(Agenda.Share(1, 10), byName["Nicolas"])
        assertEquals(Agenda.Share(1, 60), b.together)
        assertEquals(Agenda.Share(1, 30), b.unassigned)
    }

    @Test
    fun `pastilles du calendrier - taches a faire par jour`() {
        val counts = Agenda.countsByDay(Fixtures.week())
        assertEquals(2, counts[TODAY])
        assertEquals(null, counts[TODAY.plusDays(3)])
    }
}
