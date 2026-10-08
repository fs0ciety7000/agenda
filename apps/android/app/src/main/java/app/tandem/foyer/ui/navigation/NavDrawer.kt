package app.tandem.foyer.ui.navigation

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R

/** Une page du tiroir « Plus » : son itinéraire, son libellé et son icône. */
data class DrawerDestination(val route: String, @StringRes val label: Int, @DrawableRes val icon: Int)

/** Pages sans place dans la barre du bas, dans l'ordre du site. */
fun drawerDestinations(withAbsences: Boolean): List<DrawerDestination> = listOfNotNull(
    DrawerDestination("expenses", R.string.expenses_title, R.drawable.ic_drawer_wallet),
    DrawerDestination("notes", R.string.notes_title, R.drawable.ic_drawer_note),
    DrawerDestination("dates", R.string.dates_title, R.drawable.ic_drawer_cake),
    DrawerDestination("history", R.string.settings_history, R.drawable.ic_drawer_history),
    if (withAbsences) DrawerDestination("absences", R.string.absences_title, R.drawable.ic_drawer_away) else null,
    DrawerDestination("report", R.string.report_section, R.drawable.ic_drawer_flag),
    DrawerDestination("settings", R.string.nav_settings, R.drawable.ic_drawer_settings),
)

/**
 * Tiroir de la barre du bas : s'ouvre en touchant « Plus » ou en tirant la barre vers le haut,
 * et montre toutes les autres pages d'un coup d'œil (le geste retour le referme).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NavDrawer(
    destinations: List<DrawerDestination>,
    current: String?,
    onOpen: (route: String) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                stringResource(R.string.nav_more),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = 4.dp).semantics { heading() },
            )
            destinations.chunked(3).forEach { row ->
                Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { d ->
                        val selected = d.route == current
                        OutlinedCard(
                            onClick = { onOpen(d.route) },
                            modifier = Modifier.weight(1f).fillMaxHeight().heightIn(min = 88.dp).semantics { this.selected = selected },
                            border = if (selected) {
                                BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary)
                            } else {
                                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                            },
                        ) {
                            Column(
                                Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(
                                    painterResource(d.icon),
                                    contentDescription = null,
                                    tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(24.dp),
                                )
                                Text(
                                    stringResource(d.label),
                                    style = MaterialTheme.typography.labelLarge,
                                    textAlign = TextAlign.Center,
                                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                    }
                    // Dernière ligne incomplète : les tuiles gardent la même largeur.
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}
