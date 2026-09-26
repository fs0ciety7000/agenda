package be.agendagn.app.ui

import be.agendagn.app.domain.model.EditScope
import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.domain.RecurrenceSpec
import be.agendagn.app.domain.RepeatPreset
import be.agendagn.app.domain.repository.OpResult
import be.agendagn.app.testing.FakeAgendaRepository
import be.agendagn.app.testing.Fixtures
import be.agendagn.app.ui.main.AgendaViewModel
import be.agendagn.app.ui.taskform.FormError
import be.agendagn.app.ui.taskform.ScopeAction
import be.agendagn.app.ui.taskform.TaskFormViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

@OptIn(ExperimentalCoroutinesApi::class)
class ViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    private val clock = Clock.fixed(Instant.parse("2026-09-28T22:30:00Z"), ZoneId.of("UTC"))

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `aujourd hui = date du foyer (00h30 a Bruxelles, encore la veille en UTC)`() = runTest(dispatcher) {
        val vm = AgendaViewModel(FakeAgendaRepository(), clock = clock)
        advanceUntilIdle()
        assertEquals(Fixtures.TODAY, vm.state.value.today)
        assertEquals("Grace", vm.state.value.me?.displayName)
    }

    @Test
    fun `retour du reseau - rafraichissement automatique`() = runTest(dispatcher) {
        val repo = FakeAgendaRepository()
        val online = MutableStateFlow(false)
        val vm = AgendaViewModel(repo, online, clock)
        advanceUntilIdle()
        assertEquals(0, repo.refreshes)
        online.value = true
        advanceUntilIdle()
        assertEquals(1, repo.refreshes)
        assertTrue(vm.state.value.online)
    }

    @Test
    fun `cocher met a jour l affichage immediatement (optimiste)`() = runTest(dispatcher) {
        val repo = FakeAgendaRepository()
        val vm = AgendaViewModel(repo, clock = clock)
        advanceUntilIdle()
        val o = vm.state.value.occurrences.first { it.title == "Sortir les poubelles" }
        vm.toggle(o)
        advanceUntilIdle()
        val after = vm.state.value.occurrences.first { it.id == o.id }
        assertEquals(OccurrenceStatus.DONE, after.status)
        assertTrue(after.pending)
    }

    @Test
    fun `ajout rapide - apercu apres une pause de frappe, puis envoi et remise a zero`() = runTest(dispatcher) {
        val repo = FakeAgendaRepository()
        repo.preview = be.agendagn.app.domain.model.QuickAddPreview("Poubelles", Fixtures.TODAY, 1200, listOf(Fixtures.NICOLAS), null, null)
        val vm = AgendaViewModel(repo, clock = clock)
        vm.onQuickAddText("Poubelles demain 20h Nicolas")
        advanceTimeBy(100)
        assertNull(vm.quickAdd.value.preview)
        advanceUntilIdle()
        assertNotNull(vm.quickAdd.value.preview)
        assertTrue(vm.submitQuickAdd())
        advanceUntilIdle()
        assertEquals(listOf("Poubelles demain 20h Nicolas"), repo.quickAdds)
        assertEquals("", vm.quickAdd.value.text)
        assertFalse(vm.submitQuickAdd())
    }

    @Test
    fun `formulaire - titre obligatoire, repetition impose une date, creation`() = runTest(dispatcher) {
        val repo = FakeAgendaRepository()
        val vm = TaskFormViewModel(repo, null, null)
        advanceUntilIdle()
        vm.save()
        assertEquals(FormError.TITLE_REQUIRED, vm.state.value.error)
        vm.edit { it.copy(title = "Poubelles", recurrence = RecurrenceSpec(preset = RepeatPreset.WEEKLY)) }
        assertNotNull(vm.state.value.draft.date)
        assertNull(vm.state.value.error)
        vm.save()
        advanceUntilIdle()
        assertEquals("Poubelles", repo.created.single().title)
        assertTrue(vm.state.value.done)
    }

    @Test
    fun `formulaire - serie - la portee est demandee, puis appliquee`() = runTest(dispatcher) {
        val repo = FakeAgendaRepository()
        val recurring = Fixtures.week().first { it.isRecurring }
        val vm = TaskFormViewModel(repo, recurring.id, null)
        advanceUntilIdle()
        vm.edit { it.copy(title = "Poubelles (jaunes)") }
        vm.save()
        assertEquals(ScopeAction.SAVE, vm.state.value.askScopeFor)
        vm.onScope(EditScope.FOLLOWING)
        advanceUntilIdle()
        assertEquals(EditScope.FOLLOWING, repo.updates.single().second)
        assertTrue(vm.state.value.done)
    }

    @Test
    fun `formulaire - serie - repetition pre-remplie, modifiee pour les suivantes seulement`() = runTest(dispatcher) {
        val repo = FakeAgendaRepository()
        val recurring = Fixtures.week().first { it.isRecurring }
        val weekly = be.agendagn.app.domain.Recurrences.toJson(
            RecurrenceSpec(preset = RepeatPreset.WEEKLY), recurring.date, recurring.assigneeIds, Fixtures.household.members, false,
        )!!
        repo.seriesInfo = be.agendagn.app.domain.SeriesInfo(
            "s", recurring.date!!, null, null,
            weekly["rule"] as kotlinx.serialization.json.JsonObject, weekly["rotation"] as kotlinx.serialization.json.JsonObject,
            "PER_OCCURRENCE",
        )
        val vm = TaskFormViewModel(repo, recurring.id, null)
        advanceUntilIdle()
        assertEquals(RepeatPreset.WEEKLY, vm.state.value.draft.recurrence.preset)
        assertTrue(vm.state.value.canEditRecurrence)
        assertFalse(vm.state.value.seriesChanged)

        vm.edit { it.copy(recurrence = it.recurrence.copy(rotation = be.agendagn.app.domain.RotationKind.ALTERNATE)) }
        advanceUntilIdle()
        assertTrue(vm.state.value.seriesChanged)
        assertTrue(repo.previews.isNotEmpty()) // aperçu demandé au serveur
        vm.save()
        assertEquals(listOf(EditScope.FOLLOWING, EditScope.ALL), vm.state.value.scopeOptions)
        vm.onScope(EditScope.ALL)
        advanceUntilIdle()
        assertEquals("ALTERNATE", repo.recurrenceUpdates.single()!!["rotation"]!!.let { it as kotlinx.serialization.json.JsonObject }["mode"].toString().trim('"'))
    }

    @Test
    fun `formulaire - tache ponctuelle rendue recurrente`() = runTest(dispatcher) {
        val repo = FakeAgendaRepository()
        val one = Fixtures.week().first { !it.isRecurring && it.date != null }
        val vm = TaskFormViewModel(repo, one.id, null)
        advanceUntilIdle()
        vm.edit { it.copy(recurrence = RecurrenceSpec(preset = RepeatPreset.MONTHLY)) }
        vm.save()
        advanceUntilIdle()
        assertNull(vm.state.value.askScopeFor)
        assertEquals(EditScope.THIS, repo.updates.single().second)
        assertNotNull(repo.recurrenceUpdates.single())
    }

    @Test
    fun `formulaire - hors ligne ou conflit - message clair, formulaire conserve`() = runTest(dispatcher) {
        val repo = FakeAgendaRepository()
        val one = Fixtures.week().first { !it.isRecurring && it.date != null }
        val vm = TaskFormViewModel(repo, one.id, null)
        advanceUntilIdle()
        repo.updateResult = OpResult.Offline
        vm.edit { it.copy(title = "Nouveau titre") }
        vm.save()
        advanceUntilIdle()
        assertEquals(FormError.OFFLINE, vm.state.value.error)
        assertEquals("Nouveau titre", vm.state.value.draft.title)
        repo.updateResult = OpResult.Conflict
        vm.save()
        advanceUntilIdle()
        assertEquals(FormError.CONFLICT, vm.state.value.error)
        assertEquals(one.title, vm.state.value.draft.title) // version serveur rechargée
        assertFalse(vm.state.value.done)
    }

    @Test
    fun `supprimer - confirmation puis portee pour une serie`() = runTest(dispatcher) {
        val repo = FakeAgendaRepository()
        val recurring = Fixtures.week().first { it.isRecurring }
        val vm = TaskFormViewModel(repo, recurring.id, null)
        advanceUntilIdle()
        vm.requestDelete()
        assertTrue(vm.state.value.confirmDelete)
        vm.confirmDelete()
        assertEquals(ScopeAction.DELETE, vm.state.value.askScopeFor)
        vm.onScope(EditScope.ALL)
        advanceUntilIdle()
        assertEquals(listOf(EditScope.ALL), repo.deletes)
    }
}
