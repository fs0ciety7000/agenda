package be.agendagn.app.data.files

import androidx.core.content.FileProvider
import be.agendagn.app.R
import be.agendagn.app.data.local.AgendaDatabase
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.domain.model.Attachment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException

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

    companion object {
        fun safeName(name: String): String =
            name.substringAfterLast('/').substringAfterLast('\\').filter { it >= ' ' }.ifBlank { "fichier" }.take(120)
    }
}

/** Partage des pièces jointes téléchargées (autorité `<applicationId>.attachments`). */
class AttachmentFileProvider : FileProvider(R.xml.attachment_paths)
