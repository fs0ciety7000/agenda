package be.agendagn.app.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import be.agendagn.app.data.local.AgendaDatabase
import be.agendagn.app.data.remote.ApiClient
import be.agendagn.app.data.repository.AgendaRepositoryImpl
import be.agendagn.app.data.repository.AuthRepositoryImpl
import be.agendagn.app.data.sync.SyncEngine
import be.agendagn.app.domain.model.EditScope
import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.domain.model.Repeat
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.domain.repository.AuthResult
import be.agendagn.app.domain.repository.OpResult
import be.agendagn.app.domain.repository.RefreshOutcome
import be.agendagn.app.testing.FakeScheduler
import be.agendagn.app.testing.FakeSettingsStore
import be.agendagn.app.testing.FakeTokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * Parcours Android complet contre la VRAIE API (contrats JSON, Bearer, idempotence, portées).
 * Ignoré sans `-PliveApi=http://localhost:4000/` (API démarrée localement, NODE_ENV=development).
 */
@RunWith(AndroidJUnit4::class)
class LiveApiTest {
    private val base: String? = System.getProperty("agenda.liveApi")

    private fun post(path: String, body: String, token: String? = null): String {
        val request = Request.Builder().url(base + path)
            .header("X-Requested-With", "agenda-gn").header("X-Client", "mobile")
            .apply { token?.let { header("Authorization", "Bearer $it") } }
            .post(body.toRequestBody("application/json".toMediaType())).build()
        OkHttpClient().newCall(request).execute().use {
            check(it.isSuccessful) { "$path → ${it.code} ${it.body?.string()}" }
            return it.body!!.string()
        }
    }

    @Test
    fun `connexion, synchro, creation hors ligne rejouee, cocher, modifier une serie, supprimer`() = runBlocking {
        assumeTrue("API locale non fournie", base != null)
        val email = "android.${UUID.randomUUID()}@example.test"
        val registered = post("v1/auth/register", """{"email":"$email","password":"correct horse battery","displayName":"Grace"}""")
        val access = Regex("\"accessToken\":\"([^\"]+)\"").find(registered)!!.groupValues[1]
        post("v1/households", """{"name":"Grace & Nico"}""", access)

        val tokens = FakeTokenStore(null, null)
        var offline = false
        val api = ApiClient.create(base!!, tokens) { chain ->
            if (offline) throw java.net.UnknownHostException("offline")
            chain.proceed(chain.request())
        }
        val login = AuthRepositoryImpl(api, tokens).login(email, "correct horse battery")
        assertTrue(login is AuthResult.Success)

        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
        val repo = AgendaRepositoryImpl(api, db, SyncEngine(api, db, FakeSettingsStore()), FakeScheduler(), Dispatchers.Unconfined)
        assertEquals(RefreshOutcome.OK, repo.refresh())
        val household = repo.household.first()!!
        assertEquals("Grace", household.members.single().displayName)
        assertTrue(repo.categories.first().isNotEmpty()) // catégories par défaut du foyer
        val today = LocalDate.now(ZoneId.of(household.timezone))

        // Hors ligne : une tâche récurrente et un ajout rapide.
        offline = true
        repo.create(
            TaskDraft(title = "Sortir les poubelles", date = today, startMinute = 1200, durationMinutes = 10,
                assigneeIds = listOf(household.members.single().id), repeat = Repeat.WEEKLY),
        )
        repo.quickAdd("Acheter du pain demain")
        assertEquals(RefreshOutcome.OFFLINE, repo.refresh())
        offline = false
        assertEquals(RefreshOutcome.OK, repo.refresh())

        val all = repo.occurrences.first()
        assertTrue(all.none { it.isLocal || it.pending })
        val bins = all.filter { it.title == "Sortir les poubelles" }.sortedBy { it.date }
        assertTrue("une occurrence par semaine sur la fenêtre", bins.size >= 8)
        assertTrue(bins.all { it.isRecurring && it.startMinute == 1200 })
        val bread = all.single { it.title.startsWith("Acheter du pain") }
        assertEquals(today.plusDays(1), bread.date) // la phrase a été analysée par le serveur

        // Cocher, puis modifier « celle-ci et les suivantes » à partir de la 2e occurrence.
        repo.toggle(bins.first())
        repo.refresh()
        assertEquals(OccurrenceStatus.DONE, repo.occurrence(bins.first().id).first()!!.status)
        val second = repo.occurrence(bins[1].id).first()!!
        assertEquals(OpResult.Ok, repo.update(second, be.agendagn.app.domain.TaskPayloads.draftOf(second).copy(startMinute = 1230), EditScope.FOLLOWING))
        val after = repo.occurrences.first().filter { it.title == "Sortir les poubelles" }.sortedBy { it.date }
        assertEquals(1200, after.first().startMinute)
        assertTrue(after.drop(1).all { it.startMinute == 1230 })

        // Conflit : Nicolas a modifié la tâche entre-temps (ici : une première modification), puis
        // une modification basée sur l'ancienne version est refusée et la version à jour rechargée.
        assertEquals(OpResult.Ok, repo.update(bread, be.agendagn.app.domain.TaskPayloads.draftOf(bread).copy(title = "Pain frais"), EditScope.THIS))
        assertEquals(OpResult.Conflict, repo.update(bread, be.agendagn.app.domain.TaskPayloads.draftOf(bread).copy(title = "Pain"), EditScope.THIS))
        assertEquals("Pain frais", repo.occurrence(bread.id).first()!!.title)

        assertEquals(OpResult.Ok, repo.delete(repo.occurrence(bread.id).first()!!, EditScope.THIS))
        repo.refresh()
        assertTrue(repo.occurrences.first().none { it.id == bread.id })
        db.close()
    }
}
