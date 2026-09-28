package app.tandem.foyer.data.files

import androidx.core.content.FileProvider
import app.tandem.foyer.R
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.domain.model.Attachment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import app.tandem.foyer.data.local.toEntity
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Pièces jointes : téléchargées à la demande dans le cache de l'app, puis partagées en lecture
 * seule (FileProvider) avec l'app qui sait les ouvrir (lecteur PDF, galerie…).
 */
class AttachmentFiles(
    private val api: AgendaApi,
    private val db: AgendaDatabase,
    private val cacheDir: File,
) {
    /** Fichier local (déjà téléchargé si la taille correspond), ou null (hors ligne, supprimé…). */
    suspend fun download(a: Attachment): File? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        val dir = File(cacheDir, "attachments/${a.id}").apply { mkdirs() }
        val file = File(dir, safeName(a.filename))
        if (file.exists() && file.length() == a.size) return@withContext file
        try {
            val res = api.attachment(h.id, a.id)
            val body = res.body()
            if (!res.isSuccessful || body == null) return@withContext null
            body.byteStream().use { input -> file.outputStream().use { input.copyTo(it) } }
            file
        } catch (_: IOException) {
            file.delete()
            null
        }
    }

    /** Joint un fichier (photo, PDF…) à la tâche ; l'occurrence locale est mise à jour. */
    suspend fun upload(occurrenceId: String, filename: String, contentType: String, bytes: ByteArray): UploadResult =
        withContext(Dispatchers.IO) {
            if (bytes.size > MAX_BYTES) return@withContext UploadResult.TOO_LARGE
            val h = db.households().current() ?: return@withContext UploadResult.FAILED
            val part = MultipartBody.Part.createFormData(
                "file",
                safeName(filename),
                bytes.toRequestBody(contentType.toMediaTypeOrNull()),
            )
            try {
                val res = api.uploadAttachment(h.id, occurrenceId, part)
                val body = res.body()
                when {
                    res.isSuccessful && body != null -> {
                        db.occurrences().upsert(body.toEntity(h.id))
                        UploadResult.OK
                    }
                    res.code() == 413 -> UploadResult.TOO_LARGE
                    else -> UploadResult.FAILED
                }
            } catch (_: IOException) {
                UploadResult.OFFLINE
            }
        }

    suspend fun delete(occurrenceId: String, a: Attachment): Boolean = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext false
        try {
            val res = api.deleteAttachment(h.id, a.id)
            if (!res.isSuccessful && res.code() != 404) return@withContext false
            api.occurrence(h.id, occurrenceId).body()?.let { db.occurrences().upsert(it.toEntity(h.id)) }
            File(cacheDir, "attachments/${a.id}").deleteRecursively()
            true
        } catch (_: IOException) {
            false
        }
    }

    enum class UploadResult { OK, TOO_LARGE, OFFLINE, FAILED }

    companion object {
        const val MAX_BYTES = 10 * 1024 * 1024

        fun safeName(name: String): String =
            name.substringAfterLast('/').substringAfterLast('\\').filter { it >= ' ' }.ifBlank { "fichier" }.take(120)
    }
}

/** Partage des pièces jointes téléchargées (autorité `<applicationId>.attachments`). */
class AttachmentFileProvider : FileProvider(R.xml.attachment_paths)
