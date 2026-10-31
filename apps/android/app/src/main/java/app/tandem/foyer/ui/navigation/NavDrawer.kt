package app.tandem.foyer.ui.navigation

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.ui.components.MemberAvatar
import app.tandem.foyer.ui.theme.Tokens
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

/** Tuile Administration : ouvre la page `/admin` du site (pas d'écran dans l'app). */
const val ADMIN_ROUTE = "admin"

/** Pages sans place dans la barre du bas, dans l'ordre du site. */
fun drawerDestinations(withAbsences: Boolean, withAdmin: Boolean = false): List<DrawerDestination> = listOfNotNull(
    DrawerDestination("expenses", R.string.expenses_title, R.drawable.ic_drawer_wallet),
    DrawerDestination("notes", R.string.notes_title, R.drawable.ic_drawer_note),
    DrawerDestination("dates", R.string.dates_title, R.drawable.ic_drawer_cake),
    DrawerDestination("history", R.string.settings_history, R.drawable.ic_drawer_history),
    if (withAbsences) DrawerDestination("absences", R.string.absences_title, R.drawable.ic_drawer_away) else null,
    DrawerDestination("report", R.string.report_section, R.drawable.ic_drawer_flag),
    // Administration : page du site, pour l'admin seulement.
    if (withAdmin) DrawerDestination(ADMIN_ROUTE, R.string.nav_admin, R.drawable.ic_drawer_admin) else null,
    DrawerDestination("settings", R.string.nav_settings, R.drawable.ic_drawer_settings),
)

/** Grandes tuiles en tête du tiroir, avec une phrase (comme sur le site). */
private val BIG = mapOf("expenses" to R.string.drawer_expenses_hint, "dates" to R.string.drawer_dates_hint)

/**
 * Tiroir de la barre du bas : s'ouvre en touchant « Plus » ou en tirant la barre vers le haut,
 * et montre toutes les autres pages d'un coup d'œil (le geste retour le referme). Refonte
 * « Duo » : Dépenses et Dates en grandes tuiles, les autres en petites, Réglages en dernier sur
 * une ligne avec les membres du foyer.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NavDrawer(
    destinations: List<DrawerDestination>,
    current: String?,
    onOpen: (route: String) -> Unit,
    onDismiss: () -> Unit,
    members: List<Member> = emptyList(),
) {
    val big = destinations.filter { it.route in BIG }
    val small = destinations.filter { it.route !in BIG && it.route != "settings" }
    val settings = destinations.firstOrNull { it.route == "settings" }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.nav_more),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(bottom = 4.dp).semantics { heading() },
            )
            Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                big.forEach { d ->
                    Tile(d, d.route == current, onOpen, Modifier.weight(1f).fillMaxHeight().heightIn(min = 128.dp)) { selected ->
                        Column(
                            Modifier.fillMaxSize().padding(16.dp),
                            verticalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Icon(painterResource(d.icon), contentDescription = null, tint = tint(selected), modifier = Modifier.size(26.dp))
                            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(stringResource(d.label), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                Text(
                                    stringResource(BIG.getValue(d.route)),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
            small.chunked(3).forEach { row ->
                Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { d ->
                        Tile(d, d.route == current, onOpen, Modifier.weight(1f).fillMaxHeight().heightIn(min = 96.dp)) { selected ->
                            Column(
                                Modifier.fillMaxSize().padding(horizontal = 6.dp, vertical = 12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                            ) {
                                Icon(painterResource(d.icon), contentDescription = null, tint = tint(selected), modifier = Modifier.size(24.dp))
                                Text(
                                    stringResource(d.label),
                                    style = MaterialTheme.typography.labelLarge,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                    // Dernière ligne incomplète : les tuiles gardent la même largeur.
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            settings?.let { d ->
                HorizontalDivider(Modifier.padding(top = 4.dp), color = MaterialTheme.colorScheme.outlineVariant)
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 64.dp).clip(RoundedCornerShape(Tokens.Radius.md))
                        .clickable { onOpen(d.route) }
                        .semantics { selected = d.route == current },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    if (members.isEmpty()) {
                        Icon(painterResource(d.icon), contentDescription = null, modifier = Modifier.size(24.dp))
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy((-12).dp)) {
                            members.take(3).forEach { m ->
                                Box(Modifier.border(2.dp, MaterialTheme.colorScheme.surface, CircleShape)) { MemberAvatar(m, 40) }
                            }
                        }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(stringResource(d.label), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            stringResource(R.string.drawer_settings_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Icon(
                        Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun tint(selected: Boolean) =
    if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface

/** Tuile pleine, gris clair ; la page ouverte est entourée de la couleur d'action. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Tile(
    d: DrawerDestination,
    selected: Boolean,
    onOpen: (String) -> Unit,
    modifier: Modifier,
    content: @Composable (Boolean) -> Unit,
) {
    Card(
        onClick = { onOpen(d.route) },
        shape = RoundedCornerShape(Tokens.Radius.lg),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        border = if (selected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
        modifier = modifier.semantics { this.selected = selected },
    ) { content(selected) }
}
