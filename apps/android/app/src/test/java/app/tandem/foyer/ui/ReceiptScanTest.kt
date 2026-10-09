package app.tandem.foyer.ui

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.ExpensesRemote
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.local.HouseholdEntity
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.data.remote.ReceiptScanDto
import app.tandem.foyer.testing.FakeTokenStore
import app.tandem.foyer.testing.Fixtures
import app.tandem.foyer.ui.expenses.ScanPrefill
import app.tandem.foyer.ui.expenses.scanPrefill
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Locale

/** Lecture d'un ticket : appel au serveur (API simulée) et préremplissage du formulaire. */
@RunWith(AndroidJUnit4::class)
class ReceiptScanTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, AgendaDatabase::class.java).allowMainThreadQueries().build()
    private val server = MockWebServer().apply { start() }
    private val remote = ExpensesRemote(ApiClient.create(server.url("/").toString(), FakeTokenStore()), db, context.cacheDir)

    @After fun tearDown() {
        server.shutdown()
        db.close()
    }

    @Test
    fun envoie_la_photo_et_lit_la_reponse() = runBlocking {
        db.households().insertHousehold(HouseholdEntity(Fixtures.HOUSEHOLD, "Grace & Nico", "Europe/Brussels", Fixtures.GRACE))
        server.enqueue(
            MockResponse().setHeader("content-type", "application/json")
                .setBody("""{"amountCents":694,"date":"2026-10-05","merchant":"Epicerie Des Tilleuls"}"""),
        )
        val scan = remote.scanReceipt(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()))
        assertEquals(ReceiptScanDto(694, "2026-10-05", "Epicerie Des Tilleuls"), scan)
        val request = server.takeRequest()
        assertTrue(request.path!!, request.path!!.endsWith("/households/${Fixtures.HOUSEHOLD}/expenses/receipt/scan"))
        assertTrue(request.getHeader("content-type")!!.startsWith("multipart/form-data"))
        assertTrue(request.body.readUtf8().contains("filename=\"ticket.jpg\""))
    }

    @Test
    fun lecture_indisponible_rien_de_propose() = runBlocking {
        db.households().insertHousehold(HouseholdEntity(Fixtures.HOUSEHOLD, "Grace & Nico", "Europe/Brussels", Fixtures.GRACE))
        server.enqueue(MockResponse().setResponseCode(503))
        assertNull(remote.scanReceipt(byteArrayOf(1, 2, 3)))
    }

    @Test
    fun preremplissage() {
        val scan = ReceiptScanDto(123456, "2026-10-05", "Garage Martin")
        // Titre vide : le commerçant le remplit ; montant au format de la langue.
        assertEquals(ScanPrefill("1234,56", "2026-10-05", "Garage Martin"), scanPrefill(scan, Locale.FRANCE, ""))
        // Titre déjà saisi : on le garde.
        assertNull(scanPrefill(scan, Locale.FRANCE, "Vidange").title)
        // Rien de lu : rien ne change.
        assertEquals(ScanPrefill(null, null, null), scanPrefill(ReceiptScanDto(), Locale.FRANCE, ""))
    }
}
