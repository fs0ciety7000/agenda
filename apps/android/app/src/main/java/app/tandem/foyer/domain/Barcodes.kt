package app.tandem.foyer.domain

/** Codes-barres produits (EAN-8, UPC-A, EAN-13, GTIN-14), comme `@agenda/domain` (barcode.ts). */
object Barcodes {
    /** Chiffres seulement, espaces et tirets retirés. */
    fun normalize(input: String): String = input.filterNot { it.isWhitespace() || it == '-' }

    /** Vrai pour 8, 12, 13 ou 14 chiffres dont la clé de contrôle est juste. */
    fun isValid(code: String): Boolean {
        if (code.length !in setOf(8, 12, 13, 14) || !code.all { it in '0'..'9' }) return false
        val digits = code.map { it - '0' }
        // Poids 3 puis 1 en partant de la droite (hors clé).
        val sum = digits.dropLast(1).reversed().withIndex().sumOf { (i, d) -> d * if (i % 2 == 0) 3 else 1 }
        return (10 - sum % 10) % 10 == digits.last()
    }
}
