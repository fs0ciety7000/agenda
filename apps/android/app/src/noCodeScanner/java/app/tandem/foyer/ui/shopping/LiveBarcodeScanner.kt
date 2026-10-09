package app.tandem.foyer.ui.shopping

import android.content.Context

/**
 * Version vide (`-Ptandem.codeScanner=false`) : compile sans le dépôt Maven de Google ; seul le
 * bouton « Scanner en direct » disparaît, la photo reste. Même signature que src/codeScanner.
 */
const val LIVE_SCAN_SUPPORTED = false

@Suppress("UNUSED_PARAMETER")
fun startLiveScan(context: Context, onCode: (String) -> Unit, onFailed: () -> Unit) = onFailed()
