package be.agendagn.app.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import be.agendagn.app.AgendaApplication
import be.agendagn.app.domain.repository.RefreshOutcome
import java.util.concurrent.TimeUnit

interface SyncScheduler {
    /** Envoie l'outbox dès que le réseau est disponible (survit à la fermeture de l'app). */
    fun requestSync()

    /** Rafraîchissement périodique (cache + rappels), même app fermée. */
    fun schedulePeriodic()

    fun cancelAll()
}

class WorkManagerSyncScheduler(private val context: Context) : SyncScheduler {
    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    override fun requestSync() {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        // APPEND_OR_REPLACE : une action faite pendant un envoi en cours sera envoyée juste après.
        WorkManager.getInstance(context).enqueueUniqueWork(OUTBOX, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    override fun schedulePeriodic() {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS).setConstraints(online).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    override fun cancelAll() {
        WorkManager.getInstance(context).cancelUniqueWork(OUTBOX)
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
    }

    private companion object {
        const val OUTBOX = "outbox"
        const val PERIODIC = "periodic-refresh"
    }
}

/** Envoie les actions en attente puis recharge le cache et replanifie les rappels. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as AgendaApplication).container
        val outcome = container.repository.refresh()
        val pending = container.database.pendingOperations().count()
        return when {
            outcome == RefreshOutcome.SIGNED_OUT -> Result.success()
            outcome == RefreshOutcome.OFFLINE || outcome == RefreshOutcome.ERROR || pending > 0 -> Result.retry()
            else -> Result.success()
        }
    }
}
