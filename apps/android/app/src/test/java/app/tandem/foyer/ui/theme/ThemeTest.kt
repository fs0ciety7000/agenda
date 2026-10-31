package app.tandem.foyer.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test

class ThemeTest {
    @Test
    fun `identite Deux fils, papier et cobalt en clair, nuit et lilas en sombre`() {
        assertEquals(Color(0xFFF3EEE4), LightColors.background)
        assertEquals(Color(0xFF2D4BFF), LightColors.primary)
        assertEquals(Color(0xFFFFFFFF), LightColors.onPrimary)
        assertEquals(Color(0xFF0E1030), DarkColors.background)
        assertEquals(Color(0xFF8F96FF), DarkColors.primary)
        assertEquals(Color(0xFF0E1030), DarkColors.onPrimary)
    }

    @Test
    fun `le cobalt de l action est celui de la marque`() {
        assertEquals(Tokens.Brand.cobalt, LightColors.primary)
        assertEquals(Tokens.Brand.lilac, DarkColors.primary)
    }
}
