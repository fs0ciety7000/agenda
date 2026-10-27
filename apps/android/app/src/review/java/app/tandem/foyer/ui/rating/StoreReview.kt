package app.tandem.foyer.ui.rating

import android.app.Activity
import com.google.android.play.core.review.ReviewManagerFactory

/**
 * Fenêtre d'avis de Google Play (In-App Review), version Google Play seulement : la note se donne
 * sans quitter l'app, et Google limite lui-même la fréquence d'affichage. Même signature que
 * src/noReview.
 */
const val STORE_REVIEW_SUPPORTED = true

fun requestStoreReview(activity: Activity) {
    val manager = ReviewManagerFactory.create(activity)
    manager.requestReviewFlow().addOnCompleteListener { request ->
        // Échec (Play Store absent, quota atteint) : rien n'est affiché, sans message.
        if (request.isSuccessful) manager.launchReviewFlow(activity, request.result)
    }
}
