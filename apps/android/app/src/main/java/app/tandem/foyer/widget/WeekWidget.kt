package app.tandem.foyer.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.material3.ColorProviders
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import app.tandem.foyer.AgendaApplication
import app.tandem.foyer.MainActivity
import app.tandem.foyer.R
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.domain.model.OccurrenceStatus
import app.tandem.foyer.domain.repository.AgendaRepository
import app.tandem.foyer.ui.theme.DarkColors
import app.tandem.foyer.ui.theme.LightColors
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.first
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle as DateTextStyle
import java.util.Locale

/** Les 7 prochains jours, tâche par tâche (calculé depuis le cache local : hors ligne compris). */
data class WeekSnapshot(
    val signedIn: Boolean,
    val today: LocalDate = LocalDate.MIN,
    val days: List<Pair<LocalDate, List<Occurrence>>> = emptyList(),
    val members: Map<String, Member> = emptyMap(),
)

/** Widget « Semaine » : aujourd'hui et les 6 jours suivants, à cocher sans ouvrir l'app. */
class WeekWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = load((context.applicationContext as AgendaApplication).container.repository)
        provideContent {
            GlanceTheme(colors = ColorProviders(light = LightColors, dark = DarkColors)) {
                WeekWidgetContent(snapshot)
            }
        }
    }

    companion object {
        suspend fun load(repository: AgendaRepository, clock: Clock = Clock.systemUTC()): WeekSnapshot {
            val household = repository.household.first() ?: return WeekSnapshot(signedIn = false)
            val today = LocalDate.now(clock.withZone(ZoneId.of(household.timezone)))
            val week = repository.occurrences.first()
                .filter { o ->
                    val d = o.date ?: return@filter false
                    d >= today && d <= today.plusDays(6) &&
                        (o.status == OccurrenceStatus.TODO || (o.status == OccurrenceStatus.DONE && d == today))
                }
                .sortedWith(compareBy<Occurrence>({ it.date }, { it.isDone }, { it.startMinute ?: Int.MAX_VALUE }, { it.title }))
            return WeekSnapshot(
                signedIn = true,
                today = today,
                days = week.groupBy { it.date!! }.toList(),
                members = household.members.associateBy { it.id },
            )
        }

        @OptIn(FlowPreview::class)
        suspend fun keepUpdated(context: Context, repository: AgendaRepository) {
            combine(repository.household, repository.occurrences) { h, o -> h to o }
                .debounce(500)
                .collect { WeekWidget().updateAll(context) }
        }
    }
}

class WeekWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WeekWidget()
}

private sealed interface WeekRow {
    data class Day(val date: LocalDate) : WeekRow
    data class Task(val occurrence: Occurrence) : WeekRow
}

@Composable
fun WeekWidgetContent(snapshot: WeekSnapshot) {
    val context = LocalContext.current
    val colors = GlanceTheme.colors
    val locale: Locale = context.resources.configuration.locales[0]
    Column(GlanceModifier.fillMaxSize().background(colors.background).cornerRadius(20.dp).padding(12.dp)) {
        Text(
            context.getString(R.string.widget_week_name),
            style = TextStyle(color = colors.onBackground, fontSize = 17.sp, fontWeight = FontWeight.Bold),
            modifier = GlanceModifier.clickable(actionStartActivity<MainActivity>()),
        )
        Spacer(GlanceModifier.height(6.dp))
        val rows = snapshot.days.flatMap { (date, list) -> listOf(WeekRow.Day(date)) + list.map { WeekRow.Task(it) } }
        when {
            !snapshot.signedIn -> Message(context.getString(R.string.widget_signed_out))
            rows.isEmpty() -> Message(context.getString(R.string.widget_week_empty))
            else -> LazyColumn {
                items(rows.take(40), itemId = { row ->
                    when (row) {
                        is WeekRow.Day -> row.date.toEpochDay()
                        is WeekRow.Task -> row.occurrence.id.hashCode().toLong() shl 20
                    }
                }) { row ->
                    when (row) {
                        is WeekRow.Day -> Text(
                            dayTitle(row.date, snapshot.today, locale, context),
                            style = TextStyle(color = colors.primary, fontSize = 13.sp, fontWeight = FontWeight.Bold),
                            modifier = GlanceModifier.padding(top = 6.dp, bottom = 2.dp),
                        )
                        is WeekRow.Task -> TaskLine(row.occurrence, false, snapshot.members)
                    }
                }
            }
        }
    }
}

private fun dayTitle(date: LocalDate, today: LocalDate, locale: Locale, context: Context): String = when (date) {
    today -> context.getString(R.string.today)
    today.plusDays(1) -> context.getString(R.string.postpone_tomorrow)
    else -> date.dayOfWeek.getDisplayName(DateTextStyle.FULL, locale).replaceFirstChar { it.titlecase(locale) } +
        " " + DateTimeFormatter.ofPattern("d MMM", locale).format(date)
}
