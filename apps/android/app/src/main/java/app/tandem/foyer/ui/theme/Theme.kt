package app.tandem.foyer.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.compositeOver

/** Thème Material 3 alimenté par les tokens partagés avec le web (packages/design-tokens). */
internal fun lightColors(accent: Accent = Tokens.Accents.getValue(DEFAULT_ACCENT)) = lightColorScheme(
    primary = accent.light,
    onPrimary = accent.onLight,
    // Boutons flottants (« + », « Nouvelle note ») : la couleur du thème.
    primaryContainer = accent.light,
    onPrimaryContainer = accent.onLight,
    background = Tokens.Light.bg,
    onBackground = Tokens.Light.text,
    surface = Tokens.Light.surface,
    onSurface = Tokens.Light.text,
    surfaceVariant = Tokens.Light.surfaceMuted,
    onSurfaceVariant = Tokens.Light.textMuted,
    // Contours des champs, boutons et puces : 3:1 sur la surface (WCAG 1.4.11).
    outline = Tokens.Light.borderStrong,
    outlineVariant = Tokens.Light.border,
    // Puces sélectionnées, indicateur d'onglet : teinte de la couleur du thème.
    secondaryContainer = accent.light.copy(alpha = 0.12f).compositeOver(Tokens.Light.bg),
    onSecondaryContainer = Tokens.Light.text,
    surfaceContainer = Tokens.Light.surfaceMuted,
    error = Tokens.Light.danger,
)

internal fun darkColors(accent: Accent = Tokens.Accents.getValue(DEFAULT_ACCENT)) = darkColorScheme(
    primary = accent.dark,
    onPrimary = accent.onDark,
    primaryContainer = accent.dark,
    onPrimaryContainer = accent.onDark,
    background = Tokens.Dark.bg,
    onBackground = Tokens.Dark.text,
    surface = Tokens.Dark.surface,
    onSurface = Tokens.Dark.text,
    surfaceVariant = Tokens.Dark.surfaceMuted,
    onSurfaceVariant = Tokens.Dark.textMuted,
    outline = Tokens.Dark.borderStrong,
    outlineVariant = Tokens.Dark.border,
    secondaryContainer = accent.dark.copy(alpha = 0.20f).compositeOver(Tokens.Dark.bg),
    onSecondaryContainer = Tokens.Dark.text,
    surfaceContainer = Tokens.Dark.surfaceMuted,
    error = Tokens.Dark.danger,
)

/** Widgets (Glance) : thème par défaut, le widget ne lit pas le réglage de l'app. */
internal val LightColors = lightColors()
internal val DarkColors = darkColors()

/** Thème de couleur par défaut (Réglages → Apparence → Couleur). */
const val DEFAULT_ACCENT = "ink"

/** Les couleurs d'un thème ; un nom inconnu (ancienne version, réglage effacé) donne le thème par défaut. */
fun appColors(accent: String, dark: Boolean) =
    (Tokens.Accents[accent] ?: Tokens.Accents.getValue(DEFAULT_ACCENT)).let { if (dark) darkColors(it) else lightColors(it) }

private val AppShapes = Shapes(
    small = RoundedCornerShape(Tokens.Radius.sm),
    medium = RoundedCornerShape(Tokens.Radius.md),
    large = RoundedCornerShape(Tokens.Radius.lg),
    extraLarge = RoundedCornerShape(Tokens.Radius.xl),
)

@Composable
fun AgendaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    accent: String = DEFAULT_ACCENT,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = appColors(accent, darkTheme),
        shapes = AppShapes,
        typography = AppTypography,
        content = content,
    )
}
