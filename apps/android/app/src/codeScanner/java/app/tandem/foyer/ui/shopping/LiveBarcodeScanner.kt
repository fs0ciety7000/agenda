package app.tandem.foyer.ui.shopping

import android.content.Context
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/** Le scanner en direct est compilé dans cette version de l'app. */
const val LIVE_SCAN_SUPPORTED = true

/**
 * Scanner de Google Play services : son propre écran de caméra (aucune permission caméra pour
 * l'app), lecture sur le téléphone, rien n'est envoyé. Codes produits seulement (EAN, UPC-A).
 * [onCode] reçoit les chiffres ; [onFailed] si le scanner manque ou échoue ; annuler ne dit rien.
 */
fun startLiveScan(context: Context, onCode: (String) -> Unit, onFailed: () -> Unit) {
    val options = GmsBarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A)
        .enableAutoZoom()
        .build()
    GmsBarcodeScanning.getClient(context, options)
        .startScan()
        .addOnSuccessListener { barcode -> barcode.rawValue?.let(onCode) ?: onFailed() }
        .addOnFailureListener { onFailed() }
}
