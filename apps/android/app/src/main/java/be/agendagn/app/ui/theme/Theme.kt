package be.agendagn.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable

/** Thème Material 3 alimenté par les tokens partagés avec le web (packages/design-tokens). */
private val LightColors = lightColorScheme(
    primary = Tokens.Light.accent,
    onPrimary = Tokens.Light.accentFg,
    background = Tokens.Light.bg,
    onBackground = Tokens.Light.text,
    surface = Tokens.Light.surface,
    onSurface = Tokens.Light.text,
    surfaceVariant = Tokens.Light.surfaceMuted,
    onSurfaceVariant = Tokens.Light.textMuted,
    outline = Tokens.Light.border,
    error = Tokens.Light.danger,
)

private val DarkColors = darkColorScheme(
    primary = Tokens.Dark.accent,
    onPrimary = Tokens.Dark.accentFg,
    background = Tokens.Dark.bg,
    onBackground = Tokens.Dark.text,
    surface = Tokens.Dark.surface,
    onSurface = Tokens.Dark.text,
    surfaceVariant = Tokens.Dark.surfaceMuted,
    onSurfaceVariant = Tokens.Dark.textMuted,
    outline = Tokens.Dark.border,
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
