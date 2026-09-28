package app.tandem.foyer.notifications

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.tandem.foyer.AgendaApplication
import app.tandem.foyer.domain.repository.OpResult
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/**
 * Reporter depuis une notification ou le widget : exécuté dès que le réseau est là (même app
 * fermée, hors ligne compris). Tâche modifiée ailleurs entre-temps : la version est rechargée,
 * puis on réessaie.
 */
class PostponeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ID) ?: return Result.failure()
        val date = inputData.getString(KEY_DATE)?.let(LocalDate::parse) ?: return Result.failure()
        val repository = (applicationContext as AgendaApplication).container.repository
        return when (repository.move(id, date)) {
            OpResult.Ok, OpResult.NotFound -> Result.success()
            OpResult.Offline, OpResult.Conflict -> if (runAttemptCount < 5) Result.retry() else Result.failure()
            is OpResult.Failed -> Result.failure()
        }
    }

    companion object {
        private const val KEY_ID = "occurrenceId"
        private const val KEY_DATE = "date"

        fun enqueue(context: Context, occurrenceId: String, date: LocalDate) {
            val request = OneTimeWorkRequestBuilder<PostponeWorker>()
                .setInputData(workDataOf(KEY_ID to occurrenceId, KEY_DATE to date.toString()))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("postpone-$occurrenceId", ExistingWorkPolicy.REPLACE, request)
        }
    }
}
