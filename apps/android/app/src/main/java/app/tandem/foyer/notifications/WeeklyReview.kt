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
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.tandem.foyer.AgendaApplication
import app.tandem.foyer.R
import app.tandem.foyer.data.SettingsStore
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.domain.model.OccurrenceStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.TemporalAdjusters

/** Contenu de la revue : calcul pur, testé sans Android. */
data class Review(
    val doneBy: List<Pair<String, Int>>,
    val done: Int,
    val thanks: Int,
    val missed: Int,
    val nextWeek: Int,
)

object WeeklyReview {
    val DAY: DayOfWeek = DayOfWeek.SUNDAY
    val TIME: LocalTime = LocalTime.of(19, 0)

    /** Semaine du lundi au dimanche contenant `today`, comptée dans le fuseau du foyer. */
    fun build(all: List<Occurrence>, members: List<Member>, today: LocalDate, zone: ZoneId): Review {
        val monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val nextMonday = monday.plusDays(7)
        val from = monday.atStartOfDay(zone).toInstant()
        val to = nextMonday.atStartOfDay(zone).toInstant()
        val done = all.filter { it.isDone && it.completedAt != null && it.completedAt >= from && it.completedAt < to }
        val doneBy = members.map { m -> m.displayName to done.count { it.completedById == m.id } }.filter { it.second > 0 }
        return Review(
            doneBy = doneBy,
            done = done.size,
            thanks = done.sumOf { it.thankedBy.size },
            missed = all.count { it.status == OccurrenceStatus.TODO && it.date != null && it.date >= monday && it.date < today },
            nextWeek = all.count {
                it.status == OccurrenceStatus.TODO && it.date != null && it.date >= nextMonday && it.date < nextMonday.plusDays(7)
            },
        )
    }

    /** Prochain dimanche 19 h (aujourd'hui s'il n'est pas encore passé). */
    fun next(now: ZonedDateTime): ZonedDateTime {
        val at = now.toLocalDate().with(TemporalAdjusters.nextOrSame(DAY)).atTime(TIME).atZone(now.zone)
        return if (at.isAfter(now)) at else at.plusWeeks(1)
    }
}

/** Programme la revue du dimanche soir (AlarmManager, sans permission d'alarme exacte). */
class ReviewScheduler(private val context: Context, private val settings: SettingsStore) {
    private val alarms = context.getSystemService(AlarmManager::class.java)

    fun start() {
        settings.weeklyReview.onEach { enabled -> if (enabled) schedule() else alarms.cancel(pending()) }
            .launchIn(CoroutineScope(SupervisorJob() + Dispatchers.Default))
    }

    fun schedule() {
        val at = WeeklyReview.next(ZonedDateTime.now(ZoneId.systemDefault()))
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toInstant().toEpochMilli(), pending())
    }

    private fun pending(): PendingIntent = PendingIntent.getBroadcast(
        context, REQUEST, Intent(context, ReviewReceiver::class.java).setAction(ACTION),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    companion object {
        const val CHANNEL = "review"
        const val ACTION = "app.tandem.foyer.WEEKLY_REVIEW"
        private const val REQUEST = 19_00
        const val NOTIFICATION_ID = 19_00
    }
}

/** Dimanche 19 h : recharge, affiche la revue (ouvre la page « Revue » du site), reprogramme. */
class ReviewReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ReviewScheduler.ACTION) return
        val container = (context.applicationContext as AgendaApplication).container
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!container.settings.weeklyReview.first()) return@launch
                withTimeoutOrNull(8_000) { container.repository.refresh() }
                val household = container.repository.household.first() ?: return@launch
                val zone = ZoneId.of(household.timezone)
                val review = WeeklyReview.build(
                    container.repository.occurrences.first(),
                    household.members,
                    LocalDate.now(zone),
                    zone,
                )
                show(context, review, container.webBaseUrl)
            } finally {
                container.review.schedule()
                pending.finish()
            }
        }
    }

    private fun show(context: Context, review: Review, webBaseUrl: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                ReviewScheduler.CHANNEL,
                context.getString(R.string.review_channel),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = context.getString(R.string.review_channel_desc) },
        )
        val res = context.resources
        val summary = listOfNotNull(
            res.getQuantityString(R.plurals.review_done, review.done, review.done),
            review.thanks.takeIf { it > 0 }?.let { res.getQuantityString(R.plurals.review_thanks, it, it) },
            review.missed.takeIf { it > 0 }?.let { res.getQuantityString(R.plurals.review_missed, it, it) },
        ).joinToString(" · ")
        val style = NotificationCompat.InboxStyle().setSummaryText(summary)
        review.doneBy.forEach { (name, count) -> style.addLine("$name : $count") }
        style.addLine(res.getQuantityString(R.plurals.review_next, review.nextWeek, review.nextWeek))
        val open = PendingIntent.getActivity(
            context, ReviewScheduler.NOTIFICATION_ID,
            Intent(Intent.ACTION_VIEW, Uri.parse(webBaseUrl.trimEnd('/') + "/review"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, ReviewScheduler.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.review_title))
            .setContentText(summary)
            .setStyle(style)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setWhen(Instant.now().toEpochMilli())
            .build()
        NotificationManagerCompat.from(context).notify(ReviewScheduler.NOTIFICATION_ID, notification)
    }
}
