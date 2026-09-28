package app.tandem.foyer.notifications

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.tandem.foyer.AgendaApplication
import app.tandem.foyer.MainActivity
import app.tandem.foyer.R
import app.tandem.foyer.data.SettingsStore
import app.tandem.foyer.domain.Agenda
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.domain.model.OccurrenceStatus
import app.tandem.foyer.ui.components.formatMinute
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/** Contenu du récapitulatif : calcul pur, testé sans Android. */
data class Recap(val today: List<Occurrence>, val overdue: Int, val dueThisWeek: Int) {
    val isEmpty: Boolean get() = today.isEmpty() && overdue == 0 && dueThisWeek == 0
}

object MorningRecap {
    val TIME: LocalTime = LocalTime.of(8, 0)

    /** Ce qui me concerne : moi, à deux, ou à définir (jamais les tâches de l'autre seul). */
    fun build(all: List<Occurrence>, myMemberId: String?, today: LocalDate): Recap {
        val mine = all.filter { it.assigneeIds.isEmpty() || myMemberId in it.assigneeIds }
        val sections = Agenda.todaySections(mine, today)
        return Recap(
            today = sections.today.filter { it.status == OccurrenceStatus.TODO },
            overdue = sections.overdue.size,
            dueThisWeek = sections.dueThisWeek.size,
        )
    }

    /** Prochain 8 h (aujourd'hui s'il n'est pas encore passé, sinon demain). */
    fun next(now: ZonedDateTime): ZonedDateTime {
        val at = now.toLocalDate().atTime(TIME).atZone(now.zone)
        return if (at.isAfter(now)) at else at.plusDays(1)
    }
}

/** Programme le récapitulatif quotidien (AlarmManager, sans permission d'alarme exacte). */
class RecapScheduler(private val context: Context, private val settings: SettingsStore) {
    private val alarms = context.getSystemService(AlarmManager::class.java)

    fun start() {
        settings.morningRecap.onEach { enabled -> if (enabled) schedule() else alarms.cancel(pending()) }
            .launchIn(CoroutineScope(SupervisorJob() + Dispatchers.Default))
    }

    fun schedule() {
        val at = MorningRecap.next(ZonedDateTime.now(ZoneId.systemDefault()))
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toInstant().toEpochMilli(), pending())
    }

    private fun pending(): PendingIntent = PendingIntent.getBroadcast(
        context, REQUEST, Intent(context, RecapReceiver::class.java).setAction(ACTION),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    companion object {
        const val CHANNEL = "recap"
        const val ACTION = "app.tandem.foyer.MORNING_RECAP"
        private const val REQUEST = 8_00
        const val NOTIFICATION_ID = 8_00

        fun createChannel(context: Context) {
            val channel = NotificationChannel(
                CHANNEL,
                context.getString(R.string.recap_channel),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = context.getString(R.string.recap_channel_desc) }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}

/** 8 h : recharge (si le réseau le permet), affiche le récapitulatif, reprogramme demain. */
class RecapReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != RecapScheduler.ACTION) return
        val container = (context.applicationContext as AgendaApplication).container
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!container.settings.morningRecap.first()) return@launch
                withTimeoutOrNull(8_000) { container.repository.refresh() }
                val household = container.repository.household.first() ?: return@launch
                val today = LocalDate.now(ZoneId.of(household.timezone))
                val recap = MorningRecap.build(
                    container.repository.occurrences.first(),
                    container.repository.myMemberId.first(),
                    today,
                )
                if (!recap.isEmpty) show(context, recap)
            } finally {
                container.recap.schedule()
                pending.finish()
            }
        }
    }

    private fun show(context: Context, recap: Recap) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        RecapScheduler.createChannel(context)
        val res = context.resources
        val summary = listOfNotNull(
            res.getQuantityString(R.plurals.recap_today, recap.today.size, recap.today.size),
            recap.overdue.takeIf { it > 0 }?.let { res.getQuantityString(R.plurals.recap_overdue, it, it) },
            recap.dueThisWeek.takeIf { it > 0 }?.let { res.getQuantityString(R.plurals.recap_due, it, it) },
        ).joinToString(" · ")
        val style = NotificationCompat.InboxStyle().setSummaryText(summary)
        recap.today.take(6).forEach { o ->
            style.addLine(listOfNotNull(o.startMinute?.let(::formatMinute), o.title).joinToString(" "))
        }
        val open = PendingIntent.getActivity(
            context, RecapScheduler.NOTIFICATION_ID,
            Intent(context, MainActivity::class.java)
                .setAction(MainActivity.ACTION_OPEN_TAB)
                .putExtra(MainActivity.EXTRA_TAB, MainActivity.TAB_TODAY)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, RecapScheduler.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.recap_title))
            .setContentText(summary)
            .setStyle(style)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setWhen(Instant.now().toEpochMilli())
            .build()
        NotificationManagerCompat.from(context).notify(RecapScheduler.NOTIFICATION_ID, notification)
    }
}
