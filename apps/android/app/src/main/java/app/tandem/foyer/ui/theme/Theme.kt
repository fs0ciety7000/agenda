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
internal val LightColors = lightColorScheme(
    primary = Tokens.Light.accent,
    onPrimary = Tokens.Light.accentFg,
    background = Tokens.Light.bg,
    onBackground = Tokens.Light.text,
    surface = Tokens.Light.surface,
    onSurface = Tokens.Light.text,
    surfaceVariant = Tokens.Light.surfaceMuted,
    onSurfaceVariant = Tokens.Light.textMuted,
    // Contours des champs, boutons et puces : 3:1 sur la surface (WCAG 1.4.11).
    outline = Tokens.Light.borderStrong,
    outlineVariant = Tokens.Light.border,
    // Puces sélectionnées, indicateur d'onglet : teinte de l'accent (pas le violet Material par défaut).
    secondaryContainer = Tokens.Light.accent.copy(alpha = 0.14f).compositeOver(Tokens.Light.bg),
    onSecondaryContainer = Tokens.Light.text,
    surfaceContainer = Tokens.Light.surfaceMuted,
    error = Tokens.Light.danger,
)

internal val DarkColors = darkColorScheme(
    primary = Tokens.Dark.accent,
    onPrimary = Tokens.Dark.accentFg,
    background = Tokens.Dark.bg,
    onBackground = Tokens.Dark.text,
    surface = Tokens.Dark.surface,
    onSurface = Tokens.Dark.text,
    surfaceVariant = Tokens.Dark.surfaceMuted,
    onSurfaceVariant = Tokens.Dark.textMuted,
    outline = Tokens.Dark.borderStrong,
    outlineVariant = Tokens.Dark.border,
    secondaryContainer = Tokens.Dark.accent.copy(alpha = 0.22f).compositeOver(Tokens.Dark.bg),
    onSecondaryContainer = Tokens.Dark.text,
    surfaceContainer = Tokens.Dark.surfaceMuted,
    error = Tokens.Dark.danger,
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(Tokens.Radius.sm),
    medium = RoundedCornerShape(Tokens.Radius.md),
    large = RoundedCornerShape(Tokens.Radius.lg),
    extraLarge = RoundedCornerShape(Tokens.Radius.xl),
)

@Composable
fun AgendaTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        shapes = AppShapes,
        content = content,
    )
}
