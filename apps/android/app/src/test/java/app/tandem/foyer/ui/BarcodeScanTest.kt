package app.tandem.foyer.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.remote.BarcodeLookupDto
import app.tandem.foyer.ui.shopping.BarcodeButton
import app.tandem.foyer.ui.shopping.BarcodeFlow
import app.tandem.foyer.ui.shopping.BarcodeNote
import app.tandem.foyer.ui.theme.AgendaTheme
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/**
 * Code-barres : code faux refusé sans requête, nom proposé puis corrigé et retenu pour le foyer.
 * La saisie se teste sur [BarcodeFlow] : sous Robolectric, une fenêtre de dialogue contenant un
 * champ de texte n'est jamais « au repos » (vérifié sur un AlertDialog minimal), elle n'est donc
 * pas ouverte ici.
 */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "fr-rFR-w400dp-h860dp")
class BarcodeScanTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun code_faux_refuse_puis_nom_corrige_et_retenu() = runBlocking {
        val lookups = mutableListOf<String>()
        val remembered = mutableListOf<Pair<String, String>>()
        val flow = BarcodeFlow(
            lookup = { code ->
                lookups += code
                BarcodeLookupDto(code, "Lait demi-écrémé", "OPEN_FOOD_FACTS")
            },
            rememberName = { code, name ->
                remembered += code to name
                true
            },
        )
        flow.code = "2001234567890"
        flow.search()
        assertTrue(flow.codeInvalid)
        assertEquals(emptyList<String>(), lookups)

        flow.code = "2 001234 567893"
        flow.search()
        assertEquals(listOf("2001234567893"), lookups)
        assertEquals("Lait demi-écrémé", flow.name)
        // Nom gardé tel quel : rien à retenir.
        assertEquals("Lait demi-écrémé", flow.confirm())
        assertEquals(emptyList<Pair<String, String>>(), remembered)
        // Nom corrigé : retenu pour le foyer.
        flow.name = "  Lait de la ferme "
        assertEquals("Lait de la ferme", flow.confirm())
        assertEquals(listOf("2001234567893" to "Lait de la ferme"), remembered)
    }

    @Test
    fun rien_lu_ou_serveur_muet() {
        val flow = BarcodeFlow(lookup = { null }, rememberName = { _, _ -> true })
        flow.show(BarcodeLookupDto())
        assertEquals(BarcodeNote.NOT_READ, flow.note)
        flow.show(null)
        assertEquals(BarcodeNote.FAILED, flow.note)
        assertNull(runBlocking { flow.confirm() })
    }

    @Test
    fun hors_ligne_le_bouton_le_dit() {
        val messages = mutableListOf<String>()
        compose.setContent {
            AgendaTheme {
                BarcodeButton(false, { null }, { null }, { _, _ -> true }, {}, { messages += it })
            }
        }
        compose.onNodeWithText("Scanner un code-barres").performClick()
        assertEquals(listOf("Scanner un code-barres demande une connexion."), messages)
    }
}
