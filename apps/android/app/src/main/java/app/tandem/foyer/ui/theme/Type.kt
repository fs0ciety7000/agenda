package app.tandem.foyer.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import app.tandem.foyer.R

/** Police unique de l'app (design system « Duo », comme le site) : 400, 500, 600. */
val InstrumentSans = FontFamily(
    Font(R.font.instrument_sans_regular, FontWeight.Normal),
    Font(R.font.instrument_sans_medium, FontWeight.Medium),
    Font(R.font.instrument_sans_semibold, FontWeight.SemiBold),
)

private fun TextStyle.sans() = copy(fontFamily = InstrumentSans)

/** Échelle Material 3, en Instrument Sans ; les tailles suivent le réglage du téléphone (sp). */
internal val AppTypography = Typography().run {
    copy(
        displayLarge = displayLarge.sans(), displayMedium = displayMedium.sans(), displaySmall = displaySmall.sans(),
        headlineLarge = headlineLarge.sans().copy(fontWeight = FontWeight.SemiBold),
        headlineMedium = headlineMedium.sans().copy(fontWeight = FontWeight.SemiBold),
        headlineSmall = headlineSmall.sans().copy(fontWeight = FontWeight.SemiBold),
        titleLarge = titleLarge.sans().copy(fontWeight = FontWeight.SemiBold),
        titleMedium = titleMedium.sans().copy(fontWeight = FontWeight.SemiBold),
        titleSmall = titleSmall.sans(),
        bodyLarge = bodyLarge.sans(), bodyMedium = bodyMedium.sans(), bodySmall = bodySmall.sans(),
        labelLarge = labelLarge.sans(), labelMedium = labelMedium.sans(), labelSmall = labelSmall.sans(),
    )
}
