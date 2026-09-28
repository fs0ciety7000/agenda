package app.tandem.foyer.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import app.tandem.foyer.R
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

@Composable
@ReadOnlyComposable
fun currentLocale(): Locale = LocalConfiguration.current.locales[0]

fun formatMinute(minute: Int): String = "%02d:%02d".format(minute / 60, minute % 60)

@Composable
@ReadOnlyComposable
fun formatDuration(minutes: Int): String =
    if (minutes < 60) stringResource(R.string.minutes, minutes)
    else stringResource(R.string.hours_minutes, minutes / 60, minutes % 60)

/** « mardi 29 septembre » (majuscule initiale pour un titre). */
fun formatLongDate(date: LocalDate, locale: Locale): String =
    DateTimeFormatter.ofPattern("EEEE d MMMM", locale).format(date).replaceFirstChar { it.titlecase(locale) }

/** « mar. 29 sept. » : court, pour les listes. */
fun formatShortDate(date: LocalDate, locale: Locale, today: LocalDate): String =
    if (date.year == today.year) DateTimeFormatter.ofPattern("EEE d MMM", locale).format(date)
    else DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(date)
