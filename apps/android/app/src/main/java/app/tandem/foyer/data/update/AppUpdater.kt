package app.tandem.foyer.data.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tandem.foyer.data.remote.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/** `version.json` publié à côté de l'APK par le workflow android-release.yml. */
@Serializable
data class UpdateManifest(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
)

sealed interface UpdateState {
    data object Idle : UpdateState
    data class Downloading(val percent: Int) : UpdateState
    data object Failed : UpdateState
}

/**
 * Mise à jour hors Play Store : vérifie la dernière version publiée, télécharge l'APK, contrôle
 * son empreinte SHA-256 puis ouvre l'installeur Android (une confirmation « Installer » reste
 * obligatoire). Android refuse de toute façon une mise à jour signée par une autre clé.
 */
class AppUpdater(
    private val context: Context,
    private val manifestUrl: String,
    private val currentVersionCode: Int,
    private val http: OkHttpClient = OkHttpClient.Builder().callTimeout(2, TimeUnit.MINUTES).build(),
) {
    private val _available = MutableStateFlow<UpdateManifest?>(null)
    val available: StateFlow<UpdateManifest?> = _available.asStateFlow()

    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state.asStateFlow()

    val enabled: Boolean get() = manifestUrl.startsWith("https://")

    /** Renvoie la nouvelle version si elle est plus récente que celle installée. */
    suspend fun check(): UpdateManifest? = withContext(Dispatchers.IO) {
        if (!enabled) return@withContext null
        try {
            http.newCall(Request.Builder().url(manifestUrl).header("Cache-Control", "no-cache").build()).execute().use { res ->
                if (!res.isSuccessful) return@withContext null
                val manifest = json.decodeFromString<UpdateManifest>(res.body!!.string())
                manifest.takeIf { it.versionCode > currentVersionCode && it.apkUrl.startsWith("https://") }
            }
        } catch (_: Exception) {
            null
        }.also { _available.value = it }
    }

    /** Android exige d'autoriser l'app à installer des applications (une seule fois). */
    fun canInstall(): Boolean = context.packageManager.canRequestPackageInstalls()

    fun permissionIntent(): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Télécharge et vérifie l'APK ; renvoie l'intention d'installation, ou null en cas d'échec. */
    suspend fun download(manifest: UpdateManifest): Intent? = withContext(Dispatchers.IO) {
        _state.value = UpdateState.Downloading(0)
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // anciennes versions
        val file = File(dir, "tandem-${manifest.versionCode}.apk")
        try {
            http.newCall(Request.Builder().url(manifest.apkUrl).build()).execute().use { res ->
                if (!res.isSuccessful) throw IOException("HTTP ${res.code}")
                val body = res.body!!
                val total = body.contentLength().takeIf { it > 0 }
                val digest = MessageDigest.getInstance("SHA-256")
                body.byteStream().use { input ->
                    file.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var read = 0L
                        while (true) {
                            val n = input.read(buffer)
                            if (n < 0) break
                            output.write(buffer, 0, n)
                            digest.update(buffer, 0, n)
                            read += n
                            total?.let { _state.value = UpdateState.Downloading((read * 100 / it).toInt()) }
                        }
                    }
                }
                val sha = digest.digest().joinToString("") { "%02x".format(it) }
                if (!sha.equals(manifest.sha256, ignoreCase = true)) throw IOException("SHA-256 mismatch")
            }
            _state.value = UpdateState.Idle
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        } catch (_: Exception) {
            file.delete()
            _state.value = UpdateState.Failed
            null
        }
    }
}
