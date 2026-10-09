package app.tandem.foyer.ui.navigation

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R

/** Onglets de la barre du bas ; le dernier, « Plus », ouvre le tiroir. */
internal enum class Tab(val route: String, @StringRes val label: Int, val icon: ImageVector) {
    TODAY("today", R.string.nav_today, Icons.Filled.Home),
    TASKS("tasks", R.string.nav_tasks, Icons.AutoMirrored.Filled.List),
    SHOPPING("shopping", R.string.nav_shopping, Icons.Filled.ShoppingCart),
    CALENDAR("calendar", R.string.nav_calendar, Icons.Filled.DateRange),
    SETTINGS("settings", R.string.nav_more, Icons.Filled.Menu),
}

/** Repère de la barre du bas pour les tests (geste « tirer vers le haut »). */
internal const val BOTTOM_BAR_TAG = "bottom-bar"

/**
 * Barre du bas : quatre onglets et « Plus ». Toucher « Plus » ou tirer la barre vers le haut
 * ouvre le tiroir (`onMore`) ; la poignée au-dessus de la barre signale le geste.
 */
@Composable
internal fun BottomBar(current: String?, onTab: (Tab) -> Unit, onMore: () -> Unit) {
    val dragThreshold = with(LocalDensity.current) { 40.dp.toPx() }
    Column(
        Modifier
            .testTag(BOTTOM_BAR_TAG)
            .background(NavigationBarDefaults.containerColor)
            .pointerInput(Unit) {
                var pulled = 0f
                detectVerticalDragGestures(
                    onDragStart = { pulled = 0f },
                    onVerticalDrag = { _, dy ->
                        pulled -= dy
                        if (pulled > dragThreshold) {
                            pulled = Float.NEGATIVE_INFINITY
                            onMore()
                        }
                    },
                )
            },
    ) {
        Box(
            Modifier.padding(top = 6.dp).align(Alignment.CenterHorizontally).size(width = 36.dp, height = 4.dp)
                .background(MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(2.dp)),
        )
        NavigationBar {
            Tab.entries.forEach { tab ->
                NavigationBarItem(
                    selected = current == tab.route,
                    onClick = { if (tab == Tab.SETTINGS) onMore() else onTab(tab) },
                    icon = { Icon(tab.icon, contentDescription = null) },
                    label = { Text(stringResource(tab.label)) },
                )
            }
        }
    }
}
