package be.agendagn.app.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.CheckBox
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.material3.ColorProviders
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import androidx.core.net.toUri
import be.agendagn.app.AgendaApplication
import be.agendagn.app.MainActivity
import be.agendagn.app.R
import be.agendagn.app.domain.Agenda
import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.repository.AgendaRepository
import be.agendagn.app.notifications.PostponeWorker
import be.agendagn.app.notifications.ReminderScheduler
import be.agendagn.app.ui.components.formatMinute
import be.agendagn.app.ui.theme.DarkColors
import be.agendagn.app.ui.theme.LightColors
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.first
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

/** Ce que le widget affiche, calculé depuis le cache local (fonctionne hors ligne). */
data class TodaySnapshot(
    val signedIn: Boolean,
    val overdue: List<Occurrence> = emptyList(),
    val today: List<Occurrence> = emptyList(),
    val members: Map<String, Member> = emptyMap(),
) {
    val done: Int get() = today.count { it.isDone }
}

private const val MAX_ROWS = 12

/**
 * Widget « Aujourd'hui » : tâches en retard puis du jour, à cocher sans ouvrir l'app (même
 * outbox que l'app : fonctionne hors ligne). Toucher une tâche l'ouvre, « + » ouvre l'ajout rapide.
 */
class TodayWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = load(container(context).repository)
        provideContent {
            GlanceTheme(colors = ColorProviders(light = LightColors, dark = DarkColors)) {
                TodayWidgetContent(snapshot)
            }
        }
    }

    companion object {
        suspend fun load(repository: AgendaRepository, clock: Clock = Clock.systemUTC()): TodaySnapshot {
            val household = repository.household.first() ?: return TodaySnapshot(signedIn = false)
            val today = LocalDate.now(clock.withZone(ZoneId.of(household.timezone)))
            val sections = Agenda.todaySections(repository.occurrences.first(), today)
            return TodaySnapshot(
                signedIn = true,
                overdue = sections.overdue,
                today = sections.today,
                members = household.members.associateBy { it.id },
            )
        }

        /** Tient le widget à jour tant que l'app (ou la synchro de fond) tourne. */
        @OptIn(FlowPreview::class)
        suspend fun keepUpdated(context: Context, repository: AgendaRepository) {
            combine(repository.household, repository.occurrences) { h, o -> h to o }
                .debounce(500)
                .collect { TodayWidget().updateAll(context) }
        }
    }
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

/** Cocher / décocher depuis le widget. */
class ToggleTaskAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[OccurrenceIdKey] ?: return
        val repository = container(context).repository
        repository.occurrence(id).first()?.let { repository.toggle(it) }
        TodayWidget().updateAll(context)
    }
}

val OccurrenceIdKey = ActionParameters.Key<String>("occurrenceId")

/** « → » : reporter la tâche à demain (envoyé dès que le réseau est là). */
class PostponeTaskAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[OccurrenceIdKey] ?: return
        PostponeWorker.enqueue(context, id, LocalDate.now().plusDays(1))
    }
}

private fun container(context: Context) = (context.applicationContext as AgendaApplication).container

@Composable
fun TodayWidgetContent(snapshot: TodaySnapshot) {
    val context = LocalContext.current
    val colors = GlanceTheme.colors
    Column(
        GlanceModifier.fillMaxSize().background(colors.background).cornerRadius(20.dp).padding(12.dp),
    ) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(GlanceModifier.defaultWeight().clickable(actionStartActivity<MainActivity>())) {
                Text(
                    context.getString(R.string.today),
                    style = TextStyle(color = colors.onBackground, fontSize = 17.sp, fontWeight = FontWeight.Bold),
                )
                if (snapshot.signedIn && snapshot.today.isNotEmpty()) {
                    Text(
                        context.getString(R.string.today_progress, snapshot.done, snapshot.today.size),
                        style = TextStyle(color = colors.onSurfaceVariant, fontSize = 13.sp),
                    )
                }
            }
            if (snapshot.signedIn) {
                Image(
                    ImageProvider(R.drawable.ic_widget_add),
                    contentDescription = context.getString(R.string.quick_add),
                    colorFilter = androidx.glance.ColorFilter.tint(colors.onPrimary),
                    modifier = GlanceModifier.size(44.dp).background(colors.primary).cornerRadius(22.dp).padding(10.dp)
                        .clickable(
                            actionStartActivity(
                                Intent(context, MainActivity::class.java)
                                    .setAction(MainActivity.ACTION_QUICK_ADD)
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                            ),
                        ),
                )
            }
        }
        Spacer(GlanceModifier.height(8.dp))
        val rows = snapshot.overdue.map { it to true } + snapshot.today.map { it to false }
        when {
            !snapshot.signedIn -> Message(context.getString(R.string.widget_signed_out))
            rows.isEmpty() -> Message(context.getString(R.string.widget_empty))
            else -> LazyColumn {
                items(rows.take(MAX_ROWS), itemId = { it.first.id.hashCode().toLong() }) { (o, late) ->
                    TaskLine(o, late, snapshot.members)
                }
                if (rows.size > MAX_ROWS) {
                    item { Message(context.resources.getQuantityString(R.plurals.widget_more, rows.size - MAX_ROWS, rows.size - MAX_ROWS)) }
                }
            }
        }
    }
}

@Composable
internal fun Message(text: String) {
    Text(
        text,
        style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 14.sp),
        modifier = GlanceModifier.padding(vertical = 8.dp).clickable(actionStartActivity<MainActivity>()),
    )
}

@Composable
internal fun TaskLine(o: Occurrence, late: Boolean, members: Map<String, Member>) {
    val context = LocalContext.current
    val colors = GlanceTheme.colors
    val who = when {
        o.assigneeIds.isEmpty() -> context.getString(R.string.unassigned)
        o.assigneeIds.size > 1 -> context.getString(R.string.together)
        else -> members[o.assigneeIds.first()]?.displayName ?: "?"
    }
    val meta = listOfNotNull(
        if (late) context.getString(R.string.overdue) else null,
        o.startMinute?.let(::formatMinute),
        who,
    ).joinToString(" · ")
    val toggleLabel = context.getString(if (o.isDone) R.string.mark_todo else R.string.mark_done, o.title)
    Row(GlanceModifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        CheckBox(
            checked = o.isDone,
            onCheckedChange = actionRunCallback<ToggleTaskAction>(actionParametersOf(OccurrenceIdKey to o.id)),
            modifier = GlanceModifier.semantics { contentDescription = toggleLabel },
        )
        Spacer(GlanceModifier.width(4.dp))
        Column(
            GlanceModifier.defaultWeight().clickable(
                actionStartActivity(
                    Intent(context, MainActivity::class.java)
                        .putExtra(ReminderScheduler.EXTRA_ID, o.id)
                        // Une intention distincte par tâche (sinon Android réutilise la première).
                        .setData("agenda-widget://task/${o.id}".toUri())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                ),
            ),
        ) {
            Text(
                o.title,
                maxLines = 1,
                style = TextStyle(
                    color = if (o.isDone) colors.onSurfaceVariant else colors.onBackground,
                    fontSize = 15.sp,
                    textDecoration = if (o.isDone) TextDecoration.LineThrough else TextDecoration.None,
                ),
            )
            Text(
                meta,
                maxLines = 1,
                style = TextStyle(color = if (late) colors.error else colors.onSurfaceVariant, fontSize = 12.sp),
            )
        }
        if (!o.isDone) {
            Image(
                ImageProvider(R.drawable.ic_widget_postpone),
                contentDescription = context.getString(R.string.widget_postpone, o.title),
                colorFilter = androidx.glance.ColorFilter.tint(colors.onSurfaceVariant),
                modifier = GlanceModifier.size(40.dp).padding(8.dp)
                    .clickable(actionRunCallback<PostponeTaskAction>(actionParametersOf(OccurrenceIdKey to o.id))),
            )
        }
    }
}
