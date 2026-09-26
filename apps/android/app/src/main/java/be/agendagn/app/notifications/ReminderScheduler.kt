package be.agendagn.app.notifications

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
import be.agendagn.app.AgendaApplication
import be.agendagn.app.MainActivity
import be.agendagn.app.R
import be.agendagn.app.data.ReminderSettings
import be.agendagn.app.data.SettingsStore
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.domain.repository.AgendaRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/** Rappel à programmer : calcul pur, testé sans Android. */
data class Reminder(val occurrenceId: String, val title: String, val at: Instant, val startMinute: Int)

object Reminders {
    /** Horizon : les rappels plus lointains seront programmés par un rafraîchissement ultérieur. */
    const val HORIZON_HOURS = 48L

    fun plan(
        occurrences: List<Occurrence>,
        myMemberId: String?,
        timezone: String,
        settings: ReminderSettings,
        now: Instant,
    ): List<Reminder> {
        if (!settings.enabled) return emptyList()
        val zone = ZoneId.of(timezone)
        return occurrences.mapNotNull { o ->
            val date = o.date ?: return@mapNotNull null
            val start = o.startMinute ?: return@mapNotNull null
            if (o.status != OccurrenceStatus.TODO) return@mapNotNull null
            // Mes tâches (seul ou à deux) et celles « à définir » ; jamais celles attribuées à l'autre seul.
            if (o.assigneeIds.isNotEmpty() && myMemberId !in o.assigneeIds) return@mapNotNull null
            val at = ZonedDateTime.of(date.atStartOfDay(), zone).plusMinutes(start.toLong())
                .minusMinutes(settings.leadMinutes.toLong()).toInstant()
            if (at <= now || at > now.plusSeconds(HORIZON_HOURS * 3600)) null
            else Reminder(o.id, o.title, at, start)
        }
    }
}

/**
 * Programme les rappels avec AlarmManager (heure fiable même en veille, sans permission d'alarme
 * exacte). Reprogrammé automatiquement à chaque changement du cache ou des préférences.
 */
class ReminderScheduler(
    private val context: Context,
    private val repository: AgendaRepository,
    private val settings: SettingsStore,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val alarms = context.getSystemService(AlarmManager::class.java)
    private val prefs = context.getSharedPreferences("reminders", Context.MODE_PRIVATE)

    @OptIn(FlowPreview::class)
    fun start() {
        createChannel(context)
        combine(repository.occurrences, repository.household, repository.myMemberId, settings.reminders) { o, h, me, s ->
            if (h == null) emptyList() else Reminders.plan(o, me, h.timezone, s, Instant.now())
        }.debounce(1_000).onEach(::apply).launchIn(scope)
    }

    private fun apply(reminders: List<Reminder>) {
        val previous = prefs.getStringSet(KEY, emptySet()).orEmpty()
        val next = reminders.map { it.occurrenceId }.toSet()
        (previous - next).forEach { alarms.cancel(pending(it, null)) }
        for (r in reminders) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.at.toEpochMilli(), pending(r.occurrenceId, r))
        }
        prefs.edit().putStringSet(KEY, next).apply()
    }

    private fun pending(occurrenceId: String, reminder: Reminder?): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java).setAction(ACTION_SHOW)
            .putExtra(EXTRA_ID, occurrenceId)
        reminder?.let {
            intent.putExtra(EXTRA_TITLE, it.title)
            intent.putExtra(EXTRA_TIME, "%02d:%02d".format(it.startMinute / 60, it.startMinute % 60))
        }
        return PendingIntent.getBroadcast(
            context, occurrenceId.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        private const val KEY = "scheduled"
        const val CHANNEL = "reminders"
        const val ACTION_SHOW = "be.agendagn.app.REMINDER"
        const val ACTION_DONE = "be.agendagn.app.REMINDER_DONE"
        const val EXTRA_ID = "occurrenceId"
        const val EXTRA_TITLE = "title"
        const val EXTRA_TIME = "time"

        fun createChannel(context: Context) {
            val channel = NotificationChannel(
                CHANNEL,
                context.getString(R.string.notification_channel_reminders),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = context.getString(R.string.notification_channel_reminders_desc) }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}

/** Affiche le rappel ; l'action « Fait » coche la tâche (hors ligne compris, via l'outbox). */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(ReminderScheduler.EXTRA_ID) ?: return
        val notificationId = id.hashCode()
        when (intent.action) {
            ReminderScheduler.ACTION_SHOW -> show(context, id, notificationId, intent)
            ReminderScheduler.ACTION_DONE -> {
                NotificationManagerCompat.from(context).cancel(notificationId)
                val pending = goAsync()
                val repository = (context.applicationContext as AgendaApplication).container.repository
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        repository.occurrence(id).first()?.takeIf { !it.isDone }?.let { repository.toggle(it) }
                    } finally {
                        pending.finish()
                    }
                }
            }
        }
    }

    private fun show(context: Context, id: String, notificationId: Int, intent: Intent) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = PendingIntent.getActivity(
            context, notificationId,
            Intent(context, MainActivity::class.java).putExtra(ReminderScheduler.EXTRA_ID, id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val done = PendingIntent.getBroadcast(
            context, notificationId,
            Intent(context, ReminderReceiver::class.java).setAction(ReminderScheduler.ACTION_DONE)
                .putExtra(ReminderScheduler.EXTRA_ID, id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, ReminderScheduler.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(intent.getStringExtra(ReminderScheduler.EXTRA_TITLE))
            .setContentText(context.getString(R.string.reminder_body, intent.getStringExtra(ReminderScheduler.EXTRA_TIME)))
            .setContentIntent(open)
            .setAutoCancel(true)
            .addAction(0, context.getString(R.string.reminder_done), done)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()
        NotificationManagerCompat.from(context).notify(notificationId, notification)
    }
}

/** Après un redémarrage, les alarmes sont perdues : démarrer l'app suffit à les reprogrammer. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            (context.applicationContext as AgendaApplication).container.syncScheduler.requestSync()
        }
    }
}
