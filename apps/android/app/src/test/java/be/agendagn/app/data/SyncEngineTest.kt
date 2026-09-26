package be.agendagn.app.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import be.agendagn.app.data.local.AgendaDatabase
import be.agendagn.app.data.remote.ApiClient
import be.agendagn.app.data.repository.AgendaRepositoryImpl
import be.agendagn.app.data.sync.SyncEngine
import be.agendagn.app.domain.repository.OpResult
import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.domain.repository.RefreshOutcome
import be.agendagn.app.testing.FakeScheduler
import be.agendagn.app.testing.FakeSettingsStore
import be.agendagn.app.testing.FakeTokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Hors ligne → en ligne, de bout en bout : vraie base Room (en mémoire), vrai client HTTP,
 * faux serveur qui reproduit l'API (idempotence des créations comprise).
 */
@RunWith(AndroidJUnit4::class)
class SyncEngineTest {
    private val server = MockWebServer()
    private lateinit var db: AgendaDatabase
    private lateinit var repo: AgendaRepositoryImpl
    private lateinit var engine: SyncEngine
    private val settings = FakeSettingsStore()
    private val scheduler = FakeScheduler()
    private val clock = Clock.fixed(Instant.parse("2026-09-29T08:00:00Z"), ZoneOffset.UTC)

    private val requests = CopyOnWriteArrayList<RecordedRequest>()
    private var offline = false
    private var userId = "u-grace"
    /** Occurrences « serveur », par id. */
    private val serverRows = linkedMapOf<String, String>()
    private val idempotency = mutableMapOf<String, String>()
    private var failNext: Int? = null
    /** La prochaine création est traitée par le serveur, mais la réponse se perd (500). */
    private var loseNextCreateResponse = false

    private fun occurrenceJson(id: String, title: String, status: String = "TODO", date: String? = "2026-09-29") =
        """{"id":"$id","taskId":"t-$id","title":"$title","priority":"NORMAL","visibility":"SHARED","status":"$status",
        "date":${date?.let { "\"$it\"" } ?: "null"},"assigneeIds":["m-grace"],"createdById":"m-grace","isRecurring":false,"version":1}"""

    @Before
    fun setUp() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                failNext?.let { failNext = null; return MockResponse().setResponseCode(it) }
                val path = request.path!!.substringBefore('?')
                val json = { body: String -> MockResponse().setHeader("content-type", "application/json").setBody(body) }
                return when {
                    path == "/v1/me" -> json("""{"id":"$userId","email":"grace@example.be","displayName":"Grace","locale":"fr"}""")
                    path == "/v1/households" -> json(
                        """[{"id":"h1","name":"Grace & Nico","timezone":"Europe/Brussels","members":[
                        {"id":"m-grace","userId":"u-grace","displayName":"Grace","role":"OWNER","color":"sage"},
                        {"id":"m-nicolas","userId":"u-nicolas","displayName":"Nicolas","role":"MEMBER","color":"ocean"}]}]""",
                    )
                    path.endsWith("/categories") -> json("""[{"id":"c1","name":"Ménage","emoji":"🧹","position":0}]""")
                    path.endsWith("/occurrences") -> {
                        val view = request.requestUrl!!.queryParameter("view")
                        val rows = serverRows.values.filter {
                            when (view) {
                                "unscheduled" -> it.contains("\"date\":null")
                                "overdue" -> false
                                else -> !it.contains("\"date\":null")
                            }
                        }
                        json(rows.joinToString(",", "[", "]"))
                    }
                    path.contains("/checklist") -> {
                        val id = path.split('/')[5]
                        val row = serverRows[id] ?: return MockResponse().setResponseCode(404)
                        val body = request.body.readUtf8()
                        val text = Regex("\"text\":\"([^\"]+)\"").find(body)?.groupValues?.get(1)
                        val items = when (request.method) {
                            "POST" -> "[{\"id\":\"i1\",\"text\":\"$text\",\"done\":false}]"
                            "PATCH" -> "[{\"id\":\"i1\",\"text\":\"Lait\",\"done\":${body.contains("true")}}]"
                            else -> "[]"
                        }
                        val updated = row.substringBefore(",\"checklist\"").removeSuffix("}") + ",\"checklist\":$items}"
                        serverRows[id] = updated
                        json(updated).setResponseCode(if (request.method == "POST") 201 else 200)
                    }
                    request.method == "PATCH" && path.contains("/occurrences/") -> {
                        val id = path.substringAfterLast('/')
                        val row = serverRows[id] ?: return MockResponse().setResponseCode(404)
                        val body = request.body.readUtf8()
                        val version = Regex("\"version\":(\\d+)").find(row)!!.groupValues[1]
                        if (!body.contains("\"version\":$version")) return MockResponse().setResponseCode(409)
                        val date = Regex("\"date\":\"([^\"]+)\"").find(body)!!.groupValues[1]
                        val updated = row.replace(Regex("\"date\":\"[^\"]+\""), "\"date\":\"$date\"")
                            .replace("\"version\":1", "\"version\":2")
                        serverRows[id] = updated
                        json(updated)
                    }
                    path.endsWith("/complete") || path.endsWith("/reopen") -> {
                        val id = path.split('/')[5]
                        val row = serverRows[id] ?: return MockResponse().setResponseCode(404)
                        val updated = row.replace(Regex("\"status\":\"\\w+\""), "\"status\":\"${if (path.endsWith("complete")) "DONE" else "TODO"}\"")
                        serverRows[id] = updated
                        json(updated)
                    }
                    path.endsWith("/tasks") || path.endsWith("/tasks/quick") -> {
                        val key = request.getHeader("Idempotency-Key")!!
                        idempotency[key]?.let { return json(serverRows.getValue(it)).setResponseCode(201) }
                        val id = "srv-${serverRows.size + 1}"
                        val body = request.body.readUtf8()
                        val title = Regex("\"(title|text)\":\"([^\"]+)\"").find(body)!!.groupValues[2]
                        val date = Regex("\"date\":\"([^\"]+)\"").find(body)?.groupValues?.get(1)
                        serverRows[id] = occurrenceJson(id, title, date = date)
                        idempotency[key] = id
                        if (loseNextCreateResponse) {
                            loseNextCreateResponse = false
                            return MockResponse().setResponseCode(500)
                        }
                        json(serverRows.getValue(id)).setResponseCode(201)
                    }
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
        server.start()
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
        // Coupure réseau simulée côté client : exactement ce que voit l'app en mode avion.
        val api = ApiClient.create(server.url("/").toString(), FakeTokenStore()) { chain ->
            if (offline) throw java.net.UnknownHostException("offline")
            chain.proceed(chain.request())
        }
        engine = SyncEngine(api, db, settings, clock)
        repo = AgendaRepositoryImpl(api, db, engine, scheduler, Dispatchers.Unconfined, clock)
        serverRows["o1"] = occurrenceJson("o1", "Sortir les poubelles")
        serverRows["o2"] = occurrenceJson("o2", "Salle de bain")
    }

    @After
    fun tearDown() {
        db.close()
        server.shutdown()
    }

    private fun titles() = runBlocking { repo.occurrences.first().map { it.title }.sorted() }
    private fun status(id: String) = runBlocking { repo.occurrence(id).first()!!.status }

    @Test
    fun `premier chargement - foyer, membres, categories, occurrences`() = runBlocking {
        assertEquals(RefreshOutcome.OK, repo.refresh())
        assertEquals("Grace & Nico", repo.household.first()!!.name)
        assertEquals("m-grace", repo.myMemberId.first())
        assertEquals(listOf("Ménage"), repo.categories.first().map { it.name })
        assertEquals(listOf("Salle de bain", "Sortir les poubelles"), titles())
    }

    @Test
    fun `cocher hors ligne puis retour du reseau - envoye une fois, etat conserve entre-temps`() = runBlocking {
        repo.refresh()
        offline = true
        val o1 = repo.occurrence("o1").first()!!
        repo.toggle(o1)
        assertEquals(OccurrenceStatus.DONE, status("o1"))
        assertTrue(repo.occurrence("o1").first()!!.pending)
        assertEquals(1, scheduler.requests)

        // Rafraîchissement hors ligne : l'affichage ne régresse pas.
        assertEquals(RefreshOutcome.OFFLINE, repo.refresh())
        assertEquals(OccurrenceStatus.DONE, status("o1"))

        offline = false
        assertEquals(RefreshOutcome.OK, repo.refresh())
        assertEquals(1, requests.count { it.path!!.endsWith("/o1/complete") })
        assertEquals(OccurrenceStatus.DONE, status("o1"))
        assertFalse(repo.occurrence("o1").first()!!.pending)
        assertEquals(0, db.pendingOperations().count())
    }

    @Test
    fun `cocher puis decocher hors ligne - rejoue dans l ordre, etat final a faire`() = runBlocking {
        repo.refresh()
        offline = true
        repo.toggle(repo.occurrence("o1").first()!!)
        repo.toggle(repo.occurrence("o1").first()!!)
        offline = false
        repo.refresh()
        val sent = requests.map { it.path!!.substringAfterLast('/') }.filter { it == "complete" || it == "reopen" }
        assertEquals(listOf("complete", "reopen"), sent)
        assertEquals(OccurrenceStatus.TODO, status("o1"))
    }

    @Test
    fun `creation hors ligne - affichee tout de suite, creee une seule fois meme si la reponse se perd`() = runBlocking {
        repo.refresh()
        offline = true
        repo.create(TaskDraft(title = "Acheter du pain", date = java.time.LocalDate.of(2026, 9, 29)))
        repo.quickAdd("Appeler le plombier")
        assertEquals(listOf("Acheter du pain", "Appeler le plombier", "Salle de bain", "Sortir les poubelles"), titles())
        assertTrue(repo.occurrences.first().filter { it.isLocal }.all { it.pending })

        // Cocher la tâche créée hors ligne : suivra la création (identifiant remappé).
        val local = repo.occurrences.first().first { it.title == "Acheter du pain" }
        repo.toggle(local)

        offline = false
        // La première création est enregistrée par le serveur mais sa réponse se perd.
        loseNextCreateResponse = true
        repo.refresh() // envoi interrompu (500) : l'action reste en file
        repo.refresh() // rejeu avec la même Idempotency-Key
        val breadKeys = requests.filter { it.path!!.endsWith("/tasks") }.map { it.getHeader("Idempotency-Key") }
        assertEquals(2, breadKeys.size)
        assertEquals(1, breadKeys.distinct().size)
        assertEquals(4, serverRows.size)
        assertEquals(listOf("Acheter du pain", "Appeler le plombier", "Salle de bain", "Sortir les poubelles"), titles())
        assertTrue(repo.occurrences.first().none { it.isLocal || it.pending })
        val bread = repo.occurrences.first().first { it.title == "Acheter du pain" }
        assertEquals(OccurrenceStatus.DONE, bread.status)
        assertTrue(requests.any { it.path!!.endsWith("/${bread.id}/complete") })
    }

    @Test
    fun `deplacer une tache - portee celle-ci, version envoyee, cache mis a jour`() = runBlocking {
        repo.refresh()
        assertEquals(OpResult.Ok, repo.move("o1", java.time.LocalDate.parse("2026-10-01")))
        val patch = requests.last { it.method == "PATCH" }
        assertEquals("this", patch.requestUrl!!.queryParameter("scope"))
        assertEquals(java.time.LocalDate.parse("2026-10-01"), repo.occurrence("o1").first()!!.date)
        assertEquals(2, repo.occurrence("o1").first()!!.version)
    }

    @Test
    fun `deplacer hors ligne - refuse et date d origine restauree`() = runBlocking {
        repo.refresh()
        offline = true
        assertEquals(OpResult.Offline, repo.move("o1", java.time.LocalDate.parse("2026-10-01")))
        assertEquals(java.time.LocalDate.parse("2026-09-29"), repo.occurrence("o1").first()!!.date)
    }

    @Test
    fun `deplacer une tache modifiee ailleurs - conflit, version du serveur rechargee`() = runBlocking {
        repo.refresh()
        serverRows["o1"] = serverRows.getValue("o1").replace("\"version\":1", "\"version\":3")
            .replace("2026-09-29", "2026-09-30")
        assertEquals(OpResult.Conflict, repo.move("o1", java.time.LocalDate.parse("2026-10-01")))
        assertEquals(java.time.LocalDate.parse("2026-09-30"), repo.occurrence("o1").first()!!.date)
    }

    @Test
    fun `liste - ajout enregistre dans le cache, cocher hors ligne affiche puis retabli`() = runBlocking {
        repo.refresh()
        assertEquals(OpResult.Ok, repo.addChecklistItem("o1", "  Lait "))
        assertEquals(listOf("Lait"), repo.occurrence("o1").first()!!.checklist.map { it.text })
        assertEquals(OpResult.Ok, repo.setChecklistItemDone("o1", "i1", true))
        assertTrue(repo.occurrence("o1").first()!!.checklist.single().done)
        offline = true
        assertEquals(OpResult.Offline, repo.setChecklistItemDone("o1", "i1", false))
        assertTrue(repo.occurrence("o1").first()!!.checklist.single().done) // rétabli
        offline = false
        assertEquals(OpResult.Ok, repo.removeChecklistItem("o1", "i1"))
        assertEquals(emptyList<Any>(), repo.occurrence("o1").first()!!.checklist)
    }

    @Test
    fun `tache supprimee ailleurs - l action est abandonnee et signalee`() = runBlocking {
        repo.refresh()
        offline = true
        repo.toggle(repo.occurrence("o2").first()!!)
        serverRows.remove("o2")
        offline = false
        val push = engine.pushPending()
        assertEquals(1, push.rejected)
        assertEquals(0, db.pendingOperations().count())
        repo.refresh()
        assertEquals(listOf("Sortir les poubelles"), titles())
    }

    @Test
    fun `erreur serveur - l action reste en file pour plus tard`() = runBlocking {
        repo.refresh()
        offline = true
        repo.toggle(repo.occurrence("o1").first()!!)
        offline = false
        failNext = 503
        assertEquals(SyncEngine.PushOutcome.RETRY, engine.pushPending().outcome)
        assertEquals(1, db.pendingOperations().count())
        assertEquals(SyncEngine.PushOutcome.DONE, engine.pushPending().outcome)
    }

    @Test
    fun `autre compte sur le telephone - l ancien cache et ses actions sont effaces sans etre envoyes`() = runBlocking {
        repo.refresh()
        offline = true
        repo.toggle(repo.occurrence("o1").first()!!)
        offline = false
        userId = "u-someone-else"
        assertEquals(RefreshOutcome.OK, repo.refresh())
        assertEquals("u-someone-else", settings.owner)
        assertEquals(0, requests.count { it.path!!.endsWith("/complete") })
        assertEquals(0, db.pendingOperations().count())
    }
}
