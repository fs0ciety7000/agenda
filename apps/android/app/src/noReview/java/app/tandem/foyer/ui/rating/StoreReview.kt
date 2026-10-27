package app.tandem.foyer.ui.rating

import android.app.Activity

/**
 * Version vide (debug, APK direct) : l'avis ne se donne que dans l'app installée depuis Google
 * Play. Même signature que src/review.
 */
const val STORE_REVIEW_SUPPORTED = false

@Suppress("UNUSED_PARAMETER")
fun requestStoreReview(activity: Activity) = Unit
