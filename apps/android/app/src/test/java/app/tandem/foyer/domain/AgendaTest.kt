package app.tandem.foyer.domain

import app.tandem.foyer.domain.model.OccurrenceStatus
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.testing.Fixtures.GRACE
import app.tandem.foyer.testing.Fixtures.NICOLAS
import app.tandem.foyer.testing.Fixtures.TODAY
import app.tandem.foyer.testing.Fixtures.occ
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
    fun `suggestion - la personne la moins chargee, rien en cas d egalite`() {
        val b = Agenda.weekBalance(Fixtures.week(), TODAY, Fixtures.household.members)
        // Grace : 45 min + 2 × 15 ; Nicolas : 10 min + 1 × 15.
        assertEquals("Nicolas", Agenda.suggestAssignee(b)?.first?.displayName)
        val tie = b.copy(members = b.members.map { it.first to Agenda.Share(1, 30) })
        assertEquals(null, Agenda.suggestAssignee(tie))
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

    @Test
    fun `qui fait quoi sur 7 jours, a deux et a definir si utiles`() {
        val board = Agenda.weekBoard(Fixtures.week(), TODAY, Fixtures.household.members)
        assertEquals(TODAY, board.days.first())
        assertEquals(7, board.days.size)
        assertEquals(
            listOf(Agenda.BoardRowKind.MEMBER, Agenda.BoardRowKind.MEMBER, Agenda.BoardRowKind.TOGETHER, Agenda.BoardRowKind.UNASSIGNED),
            board.rows.map { it.kind },
        )
        val grace = board.rows.first { it.member?.id == GRACE }
        // Aujourd'hui : salle de bain et plantes (faite) ; demain : dentiste (perso, visible pour moi).
        assertEquals(listOf(2, 1, 0, 0, 0, 0, 0), grace.cells.map { it.size })
        // En retard (avant aujourd'hui) et sans date : pas dans le tableau.
        assertEquals(listOf(1, 0, 0, 0, 0, 0, 0), board.rows.first { it.member?.id == NICOLAS }.cells.map { it.size })
        assertEquals(1, board.rows[2].cells[2].size)
        assertEquals(1, board.rows[3].cells[4].size)
    }
}
