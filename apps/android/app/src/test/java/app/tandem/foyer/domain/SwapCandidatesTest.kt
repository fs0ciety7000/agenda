package app.tandem.foyer.domain

import app.tandem.foyer.domain.model.OccurrenceStatus
import app.tandem.foyer.domain.model.Visibility
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.testing.Fixtures.GRACE
import app.tandem.foyer.testing.Fixtures.NICOLAS
import app.tandem.foyer.ui.swaps.swapCandidates
import org.junit.Assert.assertEquals
import org.junit.Test

class SwapCandidatesTest {
    private val members = Fixtures.household.members

    @Test
    fun `responsable d'une tache partagee a faire peut la proposer a l'autre`() {
        val o = Fixtures.occ("Vaisselle", assignees = listOf(GRACE))
        assertEquals(listOf(NICOLAS), swapCandidates(o, members, GRACE).map { it.id })
    }

    @Test
    fun `pas de proposition hors des regles de l'API`() {
        // Pas responsable, tâche faite, tâche personnelle, déjà à deux.
        assertEquals(emptyList<Any>(), swapCandidates(Fixtures.occ("A", assignees = listOf(GRACE)), members, NICOLAS))
        assertEquals(emptyList<Any>(), swapCandidates(Fixtures.occ("B", assignees = listOf(GRACE), status = OccurrenceStatus.DONE), members, GRACE))
        assertEquals(emptyList<Any>(), swapCandidates(Fixtures.occ("C", assignees = listOf(GRACE), visibility = Visibility.PERSONAL), members, GRACE))
        assertEquals(emptyList<Any>(), swapCandidates(Fixtures.occ("D", assignees = listOf(GRACE, NICOLAS)), members, GRACE))
        assertEquals(emptyList<Any>(), swapCandidates(Fixtures.occ("E", assignees = listOf(GRACE)), members, null))
    }
}
