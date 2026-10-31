package app.tandem.foyer.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.tandem.foyer.R

/** Police du texte (identité « Deux fils », comme le site) : 400, 500, 600. */
val InstrumentSans = FontFamily(
    Font(R.font.instrument_sans_regular, FontWeight.Normal),
    Font(R.font.instrument_sans_medium, FontWeight.Medium),
    Font(R.font.instrument_sans_semibold, FontWeight.SemiBold),
)

/** Grands titres (« Bonjour Emma », titres de page, « Journée bouclée ») : une seule graisse, 400. */
val InstrumentSerif = FontFamily(Font(R.font.instrument_serif_regular, FontWeight.Normal))

private fun TextStyle.sans() = copy(fontFamily = InstrumentSans)

// Le serif est dessiné serré : −2 % d'approche, comme sur le site.
private fun TextStyle.serif() = copy(fontFamily = InstrumentSerif, fontWeight = FontWeight.Normal, letterSpacing = (-0.02).em)

/** Échelle Material 3 : serif pour display et grands titres, Instrument Sans ailleurs ; tailles en sp. */
internal val AppTypography = Typography().run {
    copy(
        displayLarge = displayLarge.serif(), displayMedium = displayMedium.serif(), displaySmall = displaySmall.serif(),
        headlineLarge = headlineLarge.serif(),
        // Un serif à 400 paraît plus petit qu'un sans à 600 : un cran au-dessus (28 → 32 sp).
        headlineMedium = headlineMedium.serif().copy(fontSize = 32.sp, lineHeight = 38.sp),
        headlineSmall = headlineSmall.sans().copy(fontWeight = FontWeight.SemiBold),
        titleLarge = titleLarge.sans().copy(fontWeight = FontWeight.SemiBold),
        titleMedium = titleMedium.sans().copy(fontWeight = FontWeight.SemiBold),
        titleSmall = titleSmall.sans(),
        bodyLarge = bodyLarge.sans(), bodyMedium = bodyMedium.sans(), bodySmall = bodySmall.sans(),
        labelLarge = labelLarge.sans(), labelMedium = labelMedium.sans(), labelSmall = labelSmall.sans(),
    )
}
