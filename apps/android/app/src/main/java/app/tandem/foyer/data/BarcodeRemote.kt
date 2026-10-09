package app.tandem.foyer.data

import app.tandem.foyer.data.files.AttachmentFiles
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.BarcodeLookupDto
import app.tandem.foyer.data.remote.RememberBarcodeBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * Codes-barres des produits : photo lue sur le serveur (rien n'est enregistré), nom trouvé dans
 * la mémoire du foyer ou Open Food Facts. En ligne seulement : null hors ligne ou en cas d'échec.
 */
class BarcodeRemote(private val api: AgendaApi, private val db: AgendaDatabase) {
    suspend fun scan(jpeg: ByteArray): BarcodeLookupDto? {
        if (jpeg.size > AttachmentFiles.MAX_BYTES) return null
        return call { h ->
            val part = MultipartBody.Part.createFormData("file", "code.jpg", jpeg.toRequestBody("image/jpeg".toMediaTypeOrNull()))
            api.scanBarcode(h, part).takeIf { it.isSuccessful }?.body()
        }
    }

    suspend fun lookup(code: String): BarcodeLookupDto? = call { h -> api.lookupBarcode(h, code).takeIf { it.isSuccessful }?.body() }

    /** Nom donné ou corrigé : retenu pour le foyer. */
    suspend fun remember(code: String, name: String): Boolean =
        call { h -> api.rememberBarcode(h, code, RememberBarcodeBody(name)).isSuccessful.takeIf { it } } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }
}
