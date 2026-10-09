package app.tandem.foyer.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.BackupRemote
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.local.HouseholdEntity
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.testing.FakeTokenStore
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.ui.settings.BackupSection
import app.tandem.foyer.ui.settings.backupFilename
import app.tandem.foyer.ui.theme.AgendaTheme
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream
import java.time.LocalDate

/** Sauvegarde du foyer : copiée telle quelle dans le fichier choisi ; refus et hors ligne dits. */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "fr-rFR-w400dp-h860dp")
class BackupTest {
    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
    private val server = MockWebServer().apply { start() }
    private val remote = BackupRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()), db)
    private val zip = byteArrayOf(0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4)

    @After fun tearDown() {
        server.shutdown()
        db.close()
    }

    @Test
    fun archive_copiee_dans_le_fichier_choisi() = runBlocking {
        db.households().insertHousehold(HouseholdEntity(Fixtures.HOUSEHOLD, "Emma & Tom", "Europe/Brussels", Fixtures.GRACE))
        server.enqueue(MockResponse().setHeader("content-type", "application/zip").setBody(Buffer().write(zip)))
        val out = ByteArrayOutputStream()
        assertTrue(remote.download { out })
        assertArrayEquals(zip, out.toByteArray())
        val req = server.takeRequest()
        assertEquals("POST /v1/households/${Fixtures.HOUSEHOLD}/backup", "${req.method} ${req.path}")

        // Refusé par le serveur : le fichier n'est même pas ouvert.
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"error":{"code":"FORBIDDEN"}}"""))
        var opened = false
        assertFalse(remote.download { opened = true; ByteArrayOutputStream() })
        assertFalse(opened)
    }

    @Test
    fun nom_du_fichier_et_hors_ligne() {
        assertEquals("tandem-foyer-2026-10-09.zip", backupFilename(LocalDate.of(2026, 10, 9)))
        val messages = mutableListOf<String>()
        compose.setContent { AgendaTheme { BackupSection(false, { false }, { messages += it }) } }
        compose.onNodeWithText("Télécharger la sauvegarde").performClick()
        assertEquals(listOf("Télécharger la sauvegarde demande une connexion."), messages)
    }
}
