package app.tandem.foyer.ui.shopping

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.tandem.foyer.R
import app.tandem.foyer.domain.Aisles
import app.tandem.foyer.domain.model.ShoppingItem
import app.tandem.foyer.ui.theme.Tokens

/**
 * Mode magasin : plein écran, gros caractères, rangé par rayon, écran maintenu allumé.
 * Toucher une ligne la met dans le panier (ou l'en ressort). Retour ou ✕ pour quitter.
 */
@Composable
fun StoreMode(items: List<ShoppingItem>, onToggle: (ShoppingItem) -> Unit, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val view = LocalView.current
        DisposableEffect(Unit) {
            view.keepScreenOn = true
            onDispose { view.keepScreenOn = false }
        }
        val toBuy = items.filter { !it.done }
        val inCart = items.filter { it.done }
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().systemBarsPadding().padding(horizontal = 16.dp)) {
                Row(Modifier.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            stringResource(R.string.store_title),
                            style = MaterialTheme.typography.headlineMedium,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(
                            if (toBuy.isEmpty()) stringResource(R.string.store_all_in_cart)
                            else pluralStringResource(R.plurals.store_left, toBuy.size, toBuy.size),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onClose) {
                        Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.close))
                    }
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val byAisle = toBuy.groupBy { Aisles.of(it.aisle) }
                    Aisles.ORDER.filter { byAisle.containsKey(it) }.forEach { aisle ->
                        item(key = "a-$aisle") {
                            Text(
                                stringResource(Aisles.label(aisle)),
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 8.dp).semantics { heading() },
                            )
                        }
                        items(byAisle.getValue(aisle), key = { it.id }) { StoreRow(it, onToggle) }
                    }
                    if (inCart.isNotEmpty()) {
                        item(key = "cart") {
                            Text(
                                stringResource(R.string.shopping_in_cart, inCart.size),
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 8.dp).semantics { heading() },
                            )
                        }
                        items(inCart, key = { "c-" + it.id }) { StoreRow(it, onToggle) }
                    }
                }
            }
        }
    }
}

@Composable
private fun StoreRow(item: ShoppingItem, onToggle: (ShoppingItem) -> Unit) {
    val success = if (isSystemInDarkTheme()) Tokens.Dark.success else Tokens.Light.success
    val shape = RoundedCornerShape(Tokens.Radius.lg)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .toggleable(value = item.done, role = Role.Checkbox, onValueChange = { onToggle(item) })
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(32.dp)
                .border(2.dp, if (item.done) success else MaterialTheme.colorScheme.outline, CircleShape)
                .background(if (item.done) success else Color.Transparent, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (item.done) Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.surface)
        }
        Text(
            listOfNotNull(item.text, item.quantity).joinToString("  "),
            style = MaterialTheme.typography.headlineSmall,
            textDecoration = if (item.done) TextDecoration.LineThrough else null,
            color = if (item.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = 16.dp).weight(1f),
        )
    }
}
