// Généré par packages/design-tokens (pnpm --filter @agenda/design-tokens gen:android) — ne pas éditer.
package app.tandem.foyer.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Couleur d'action d'un thème, en clair et en sombre. */
data class Accent(val light: Color, val onLight: Color, val dark: Color, val onDark: Color)

object Tokens {
    object Light {
        val bg = Color(0xFFFFFFFF)
        val surface = Color(0xFFFFFFFF)
        val surfaceMuted = Color(0xFFF3F4F6)
        val border = Color(0xFFE5E7EB)
        val borderStrong = Color(0xFF80848C)
        val text = Color(0xFF17181C)
        val textMuted = Color(0xFF5F636B)
        val accent = Color(0xFF17181C)
        val accentFg = Color(0xFFFFFFFF)
        val success = Color(0xFF1F7A50)
        val warning = Color(0xFF8A5A00)
        val danger = Color(0xFFB42318)
        val onMember = Color(0xFFFFFFFF)
    }
    object Dark {
        val bg = Color(0xFF0F1012)
        val surface = Color(0xFF18191C)
        val surfaceMuted = Color(0xFF222327)
        val border = Color(0xFF2E3035)
        val borderStrong = Color(0xFF70747C)
        val text = Color(0xFFF2F3F5)
        val textMuted = Color(0xFFA6AAB2)
        val accent = Color(0xFFF2F3F5)
        val accentFg = Color(0xFF17181C)
        val success = Color(0xFF6FD39F)
        val warning = Color(0xFFF2C46D)
        val danger = Color(0xFFF59088)
        val onMember = Color(0xFF0F1012)
    }
    object MemberLight {
        val sage = Color(0xFF557E60)
        val ocean = Color(0xFF3C7BA2)
        val amber = Color(0xFF9F691B)
        val plum = Color(0xFF7A5C99)
        val clay = Color(0xFFA65D3D)
        val slate = Color(0xFF5B6770)
    }
    object MemberDark {
        val sage = Color(0xFF86B592)
        val ocean = Color(0xFF6FA8CC)
        val amber = Color(0xFFDDA24A)
        val plum = Color(0xFFA78BC4)
        val clay = Color(0xFFCF8667)
        val slate = Color(0xFF8D99A3)
    }
    /** Thèmes au choix (Réglages → Apparence) ; « ink » par défaut. */
    val Accents: Map<String, Accent> = mapOf(
        "ink" to Accent(Color(0xFF17181C), Color(0xFFFFFFFF), Color(0xFFF2F3F5), Color(0xFF17181C)),
        "coral" to Accent(Color(0xFFC4314B), Color(0xFFFFFFFF), Color(0xFFFF8C98), Color(0xFF2B0A10)),
        "ocean" to Accent(Color(0xFF1D5BD8), Color(0xFFFFFFFF), Color(0xFF8DB6FF), Color(0xFF0A1A3A)),
        "lagoon" to Accent(Color(0xFF0B6E6E), Color(0xFFFFFFFF), Color(0xFF6FD3CF), Color(0xFF062424)),
    )
    object Radius {
        val sm = 8.dp
        val md = 12.dp
        val lg = 20.dp
        val xl = 28.dp
    }
    object Motion {
        const val FAST = 120
        const val BASE = 180
        const val SLOW = 260
    }
}
