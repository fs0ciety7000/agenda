package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.BackupBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.io.OutputStream

/**
 * Sauvegarde du foyer (archive .zip, cf. docs/guide/compte.md) : copiée telle quelle, en continu,
 * dans le fichier choisi par l'utilisateur. Rien n'est gardé dans l'app.
 */
class BackupRemote(private val api: AgendaApi, private val db: AgendaDatabase) {
    /**
     * Faux si hors ligne, refusé ou interrompu ; [open] n'est appelé qu'une fois la réponse reçue.
     * Avec [passphrase], le serveur chiffre l'archive (fichier .tandem).
     */
    suspend fun download(passphrase: String?, open: () -> OutputStream?): Boolean = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext false
        try {
            val res = api.backup(h.id, BackupBody(passphrase))
            val body = res.body()
            if (!res.isSuccessful || body == null) return@withContext false
            val out = open() ?: return@withContext false
            body.byteStream().use { input -> out.use { input.copyTo(it) } }
            true
        } catch (_: IOException) {
            false
        }
    }
}
