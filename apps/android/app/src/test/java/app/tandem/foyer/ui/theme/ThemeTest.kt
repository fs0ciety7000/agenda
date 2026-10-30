package app.tandem.foyer.ui.theme

import org.junit.Assert.assertEquals
import org.junit.Test

class ThemeTest {
    @Test
    fun `chaque theme change la couleur d action, clair et sombre`() {
        for ((name, accent) in Tokens.Accents) {
            assertEquals(name, accent.light, appColors(name, dark = false).primary)
            assertEquals(name, accent.onLight, appColors(name, dark = false).onPrimary)
            assertEquals(name, accent.dark, appColors(name, dark = true).primary)
        }
    }

    @Test
    fun `theme inconnu ou efface, celui par defaut`() {
        assertEquals(Tokens.Accents.getValue(DEFAULT_ACCENT).light, appColors("prune", dark = false).primary)
        assertEquals(Tokens.Light.bg, appColors("coral", dark = false).background)
    }
}
