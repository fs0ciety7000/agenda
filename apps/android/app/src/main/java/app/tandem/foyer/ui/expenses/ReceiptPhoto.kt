package app.tandem.foyer.ui.expenses

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi
import app.tandem.foyer.data.remote.ReceiptScanDto
import app.tandem.foyer.domain.Money
import java.io.ByteArrayOutputStream
import java.util.Locale

/** Champs du formulaire préremplis par la lecture d'un ticket (null : on garde la saisie). */
data class ScanPrefill(val amount: String?, val date: String?, val title: String?)

/** Le commerçant ne remplace pas un titre déjà saisi ; montant et date, eux, viennent du ticket. */
fun scanPrefill(scan: ReceiptScanDto, locale: Locale, currentTitle: String) = ScanPrefill(
    amount = scan.amountCents?.let { Money.editable(it, locale) },
    date = scan.date,
    title = scan.merchant?.takeIf { currentTitle.isBlank() },
)

/**
 * Photo du ticket en JPEG droit, 2 000 px de côté au plus : un format que le serveur sait lire
 * (les photos HEIC sont converties), redressée selon l'EXIF, et légère à envoyer.
 */
object ReceiptPhoto {
    private const val MAX_SIDE = 2000

    fun toJpeg(context: Context, uri: Uri): ByteArray? = runCatching {
        val bitmap = if (Build.VERSION.SDK_INT >= 28) decodeUpright(context, uri) else decodeLegacy(context, uri)
        bitmap?.let { b ->
            ByteArrayOutputStream().use { out ->
                b.compress(Bitmap.CompressFormat.JPEG, 90, out)
                out.toByteArray()
            }
        }
    }.getOrNull()

    /** Android 9 et plus : ImageDecoder applique l'orientation EXIF de lui-même. */
    @RequiresApi(28)
    private fun decodeUpright(context: Context, uri: Uri): Bitmap =
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            val side = maxOf(info.size.width, info.size.height)
            if (side > MAX_SIDE) decoder.setTargetSampleSize((side + MAX_SIDE - 1) / MAX_SIDE)
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }

    /** Android 8 : décodage simple, sans redressement (le serveur lit quand même un ticket droit). */
    private fun decodeLegacy(context: Context, uri: Uri): Bitmap? {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > MAX_SIDE) sample *= 2
        return resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        }
    }
}
