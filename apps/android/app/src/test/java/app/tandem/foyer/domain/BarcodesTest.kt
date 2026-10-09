package app.tandem.foyer.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mêmes cas que packages/domain/src/barcode.test.ts. */
class BarcodesTest {
    @Test
    fun cle_de_controle() {
        assertTrue(Barcodes.isValid("2001234567893"))
        assertFalse(Barcodes.isValid("2001234567890"))
        assertTrue(Barcodes.isValid("96385074"))
        assertTrue(Barcodes.isValid("036000291452"))
        assertTrue(Barcodes.isValid("10012345678902"))
    }

    @Test
    fun pas_un_code_produit() {
        listOf("", "1234567", "12345678901", "abcdefgh", "https://exemple.test").forEach { assertFalse(it, Barcodes.isValid(it)) }
    }

    @Test
    fun espaces_et_tirets() {
        assertEquals("2001234567893", Barcodes.normalize(" 2 001234-567893 "))
    }
}
