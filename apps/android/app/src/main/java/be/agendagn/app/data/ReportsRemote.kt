package be.agendagn.app.data

import android.content.Context
import android.os.Build
import be.agendagn.app.BuildConfig
import be.agendagn.app.data.local.AgendaDatabase
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.data.remote.CreateReportBody
import be.agendagn.app.data.remote.ReportDiagnosticsDto
import be.agendagn.app.data.remote.ReportDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.ZoneId
import java.util.Locale

/** Capture d'écran jointe : 5 Mo au plus (cf. REPORT_SCREENSHOT_MAX_BYTES). */
const val REPORT_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024

/**
 * Signalements (bug, idée, question), envoyés en ligne. Les informations techniques ne partent
 * que si l'utilisateur coche la case, et il les voit avant l'envoi : jamais de contenu de tâche.
 */
class ReportsRemote(private val context: Context, private val api: AgendaApi, private val db: AgendaDatabase) {

    sealed interface SendResult {
        data object Sent : SendResult
        /** Envoyé, mais la capture a été refusée (format, taille) ou n'a pas pu partir. */
        data object SentWithoutScreenshot : SendResult
        data object Offline : SendResult
        data object TooMany : SendResult
        data object Failed : SendResult
    }

    /** Ce qui serait joint, affiché tel quel à l'utilisateur avant l'envoi. */
    suspend fun diagnostics(online: Boolean): ReportDiagnosticsDto {
        val pending = withContext(Dispatchers.IO) { db.pendingOperations().all().size }
        val metrics = context.resources.displayMetrics
        val dp = { px: Int -> (px / metrics.density).toInt() }
        return ReportDiagnosticsDto(
            appVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}, ${BuildConfig.BUILD_TYPE})",
            os = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            device = "${Build.MANUFACTURER} ${Build.MODEL}".take(80),
            locale = Locale.getDefault().toLanguageTag(),
            timezone = ZoneId.systemDefault().id,
            screen = "${dp(metrics.widthPixels)}×${dp(metrics.heightPixels)}",
            page = "settings",
            online = online,
            pendingChanges = pending,
        )
    }

    suspend fun send(
        body: CreateReportBody,
        screenshot: Pair<ByteArray, String>?,
    ): SendResult = withContext(Dispatchers.IO) {
        try {
            val res = api.createReport(body)
            if (res.code() == 429) return@withContext SendResult.TooMany
            val report = res.body() ?: return@withContext SendResult.Failed
            if (screenshot == null) return@withContext SendResult.Sent
            val (bytes, type) = screenshot
            val part = MultipartBody.Part.createFormData(
                "file",
                "capture",
                bytes.toRequestBody(type.toMediaTypeOrNull()),
            )
            val uploaded = try {
                api.uploadReportScreenshot(report.id, part).isSuccessful
            } catch (_: IOException) {
                false
            }
            if (uploaded) SendResult.Sent else SendResult.SentWithoutScreenshot
        } catch (_: IOException) {
            SendResult.Offline
        }
    }

    suspend fun mine(): List<ReportDto>? = withContext(Dispatchers.IO) {
        try {
            api.reports().body()
        } catch (_: IOException) {
            null
        }
    }

    suspend fun delete(id: String): Boolean = withContext(Dispatchers.IO) {
        try {
            api.deleteReport(id).isSuccessful
        } catch (_: IOException) {
            false
        }
    }
}
