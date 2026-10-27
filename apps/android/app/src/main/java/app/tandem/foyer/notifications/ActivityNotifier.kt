package app.tandem.foyer.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.tandem.foyer.MainActivity
import app.tandem.foyer.R
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.NotificationDto
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
import app.tandem.foyer.domain.Money
import java.time.Instant
import java.time.YearMonth
import java.time.format.TextStyle

/**
 * Notifications du foyer (« Nicolas vous a confié… ») affichées sur le téléphone : relevées tout
 * de suite quand le serveur réveille l'app (Firebase, si configuré), et sinon à chaque
 * synchronisation (ouverture de l'app, retour du réseau, synchronisation de fond).
 * Au premier passage, rien n'est affiché (on ne rejoue pas l'historique).
 */
class ActivityNotifier(
    private val context: Context,
    private val api: AgendaApi,
    private val now: () -> Instant = Instant::now,
) {
    private val prefs = context.getSharedPreferences("activity", Context.MODE_PRIVATE)
    /** Réveil Firebase et retour dans l'app en même temps : une seule relève à la fois (pas de doublon). */
    private val mutex = Mutex()

    /** Renvoie les notifications affichées (tests). */
    suspend fun poll(householdId: String): List<NotificationDto> = mutex.withLock { pollLocked(householdId) }

    private suspend fun pollLocked(householdId: String): List<NotificationDto> {
        val since = prefs.getString(KEY_SINCE, null)
        if (since == null) {
            prefs.edit().putString(KEY_SINCE, now().toString()).apply()
            return emptyList()
        }
        val items = try {
            api.notifications(householdId, since).body()?.items ?: return emptyList()
        } catch (_: IOException) {
            return emptyList()
        }
        val toShow = items.filter {
            it.push && it.readAt == null &&
                (it.type in UNTITLED || it.title != null)
        }
        toShow.forEach(::show)
        items.maxOfOrNull { it.createdAt }?.let { prefs.edit().putString(KEY_SINCE, it).apply() }
        return toShow
    }

    private fun show(n: NotificationDto) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.activity_channel), NotificationManager.IMPORTANCE_DEFAULT),
        )
        val text = when (n.type) {
            "TASK_ASSIGNED" -> context.getString(
                if (n.recurring) R.string.activity_assigned_recurring else R.string.activity_assigned,
                n.byName ?: "?",
                n.title ?: "",
            )
            "TASK_COMMENT" -> context.getString(R.string.activity_commented, n.byName ?: "?", n.title ?: "")
            "TASK_THANKS" -> context.getString(R.string.activity_thanked, n.byName ?: "?", n.title ?: "")
            "TASK_SWAP_REQUEST" -> context.getString(R.string.activity_swap_request, n.byName ?: "?", n.title ?: "")
            "TASK_SWAP_ANSWER" -> context.getString(
                if (n.code == "ACCEPTED") R.string.activity_swap_accepted else R.string.activity_swap_declined,
                n.byName ?: "?",
                n.title ?: "",
            )
            "EXPENSE_BUDGET" -> budgetText(n)
            "EXPENSE_MONTHLY" -> monthlyText(n)
            "IMPORTANT_DATE" -> when (val d = n.daysLeft ?: 0) {
                0 -> context.getString(R.string.activity_date_today, n.title ?: "")
                1 -> context.getString(R.string.activity_date_tomorrow, n.title ?: "")
                else -> context.resources.getQuantityString(R.plurals.activity_date_in, d, n.title ?: "", d)
            }
            else -> context.getString(R.string.activity_calendar_failed)
        }
        val open = PendingIntent.getActivity(
            context, n.id.hashCode(),
            Intent(context, MainActivity::class.java)
                .apply { n.occurrenceId?.let { putExtra(ReminderScheduler.EXTRA_ID, it) } }
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        NotificationManagerCompat.from(context).notify(
            n.id.hashCode(),
            NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(context.getString(R.string.app_name))
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build(),
        )
    }

    private fun monthName(n: NotificationDto, locale: java.util.Locale): String = runCatching {
        YearMonth.parse(n.month).month.getDisplayName(TextStyle.FULL_STANDALONE, locale)
    }.getOrDefault(n.month.orEmpty())

    /**
     * « Bilan du mois · septembre : 312,40 € de dépenses communes (3 dépenses). Payé : Emma 200,00 €,
     * Tom 112,40 €. », comme sur le site (prénoms dans l'ordre de l'API : alphabétique).
     */
    private fun monthlyText(n: NotificationDto): String {
        val locale = context.resources.configuration.locales[0]
        val count = n.count ?: 0
        val paid = n.paid.orEmpty().joinToString(", ") { "${it.name} ${Money.format(it.amountCents, locale)}" }
        val amount = Money.format(n.amountCents ?: 0, locale)
        val budget = n.budgetCents
        return if (budget != null) {
            context.resources.getQuantityString(
                R.plurals.activity_monthly_budget, count, monthName(n, locale), amount, count, paid,
                Money.format(budget, locale),
            )
        } else {
            context.resources.getQuantityString(R.plurals.activity_monthly, count, monthName(n, locale), amount, count, paid)
        }
    }

    /** « Budget commun · octobre : 80 % atteint (640,00 € sur 800,00 €) », comme sur le site. */
    private fun budgetText(n: NotificationDto): String {
        val locale = context.resources.configuration.locales[0]
        val month = monthName(n, locale)
        n.category?.let { cat ->
            return context.getString(
                R.string.activity_budget_category,
                context.getString(Money.categoryRes(cat)),
                month,
                n.level ?: 80,
                Money.format(n.amountCents ?: 0, locale),
                Money.format(n.budgetCents ?: 0, locale),
            )
        }
        return context.getString(
            R.string.activity_budget,
            month,
            n.level ?: 80,
            Money.format(n.amountCents ?: 0, locale),
            Money.format(n.budgetCents ?: 0, locale),
        )
    }

    private companion object {
        /** Notifications sans titre de tâche ou de date, toujours affichées. */
        val UNTITLED = setOf("CALENDAR_SYNC_FAILED", "EXPENSE_BUDGET", "EXPENSE_MONTHLY")
        const val CHANNEL = "activity"
        const val KEY_SINCE = "since"
    }
}
