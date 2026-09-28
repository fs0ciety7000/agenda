package app.tandem.foyer.ui.components

import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.liveRegion

fun SemanticsPropertyReceiver.liveRegionPolite() {
    liveRegion = LiveRegionMode.Polite
}
