package app.tandem.foyer.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.local.HouseholdEntity
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.data.remote.ImportantDateDto
import app.tandem.foyer.testing.FakeTokenStore
import app.tandem.foyer.testing.Fixtures
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate

/** Notes et dates lisibles hors ligne : la dernière liste lue reste consultable. */
@RunWith(AndroidJUnit4::class)
class OfflineCacheTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
    private val server = MockWebServer().apply { start() }

    @After fun tearDown() {
        server.shutdown()
        db.close()
    }

    @Test
    fun notes_lues_puis_hors_ligne() = runBlocking {
        db.households().insertHousehold(HouseholdEntity(Fixtures.HOUSEHOLD, "Grace & Nico", "Europe/Brussels", Fixtures.GRACE))
        val notes = NotesRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()), db)
        assertNull(notes.cached())
        server.enqueue(
            MockResponse().setHeader("content-type", "application/json").setBody(
                """[{"id":"n1","title":"Wi-Fi","body":"Code : 4F7K","pinned":true,"createdById":"g","updatedById":"g",
                "createdAt":"2026-10-01T10:00:00.000Z","updatedAt":"2026-10-08T10:00:00.000Z","version":1}]""",
            ),
        )
        assertEquals("Wi-Fi", notes.list()?.single()?.title)
        // Plus de réseau : la liste ne vient plus de l'API, la copie reste.
        server.shutdown()
        assertNull(notes.list())
        assertEquals("Code : 4F7K", notes.cached()?.single()?.body)
        // Déconnexion : tout est effacé.
        db.clearAllTables()
        assertNull(notes.cached())
    }

    @Test
    fun dates_remises_a_jour() {
        val today = LocalDate.parse("2026-10-20")
        val list = DatesRemote.refreshed(
            listOf(
                // Lue le 8 octobre : « dans 5 jours » (13 octobre), donc passée le 20.
                ImportantDateDto("d1", "Anniversaire de mamie", "BIRTHDAY", 10, 13, 1950, true, 7, "2026-10-13", 5, 76),
                ImportantDateDto("d2", "Entretien chaudière", "MAINTENANCE", 11, 17, null, true, 0, "2026-11-17", 40, null),
                ImportantDateDto("d3", "Mariage de Léon", "OTHER", 10, 15, 2026, false, 7, "2026-10-15", 7, 0),
            ),
            today,
        )
        assertEquals(listOf("d2", "d1", "d3"), list.map { it.id })
        assertEquals(28, list[0].daysLeft)
        // Annuelle passée : l'an prochain, un an de plus.
        assertEquals("2027-10-13", list[1].nextDate)
        assertEquals(77, list[1].years)
        // Unique passée : plus de prochaine fois.
        assertNull(list[2].nextDate)
    }
}
