package be.agendagn.app.notifications

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
import be.agendagn.app.MainActivity
import be.agendagn.app.R
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.data.remote.NotificationDto
import java.io.IOException
import java.time.Instant

/**
 * Notifications du foyer (« Nicolas vous a confié… ») affichées sur le téléphone, sans service de
 * push : relevées à chaque synchronisation (ouverture de l'app, retour du réseau, toutes les heures).
 * Au premier passage, rien n'est affiché (on ne rejoue pas l'historique).
 */
class ActivityNotifier(
    private val context: Context,
    private val api: AgendaApi,
    private val now: () -> Instant = Instant::now,
) {
    private val prefs = context.getSharedPreferences("activity", Context.MODE_PRIVATE)

    /** Renvoie les notifications affichées (tests). */
    suspend fun poll(householdId: String): List<NotificationDto> {
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
        val toShow = items.filter { it.push && it.readAt == null && (it.type != "TASK_ASSIGNED" || it.title != null) }
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

    private companion object {
        const val CHANNEL = "activity"
        const val KEY_SINCE = "since"
    }
}
