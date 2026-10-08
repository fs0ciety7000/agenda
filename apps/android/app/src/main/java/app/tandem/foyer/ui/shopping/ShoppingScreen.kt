package app.tandem.foyer.ui.shopping

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.remember
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import app.tandem.foyer.domain.Aisles
import app.tandem.foyer.R
import app.tandem.foyer.domain.model.Meal
import app.tandem.foyer.ui.components.currentLocale
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.domain.model.ShoppingItem
import app.tandem.foyer.domain.repository.SyncState
import app.tandem.foyer.ui.components.EmptyState
import app.tandem.foyer.ui.components.SectionHeader
import app.tandem.foyer.ui.components.SyncBanner

/** « lait, pain ; œufs » ou une ligne par article → plusieurs articles d'un coup. */
fun splitShoppingItems(text: String): List<String> =
    text.split('\n', ',', ';').map { it.trim().take(200) }.filter { it.isNotEmpty() }

/**
 * Liste de courses permanente du foyer : l'un ajoute, l'autre coche au magasin, en temps réel.
 * Fonctionne hors ligne (affiché tout de suite, envoyé au retour du réseau).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShoppingScreen(
    items: List<ShoppingItem>,
    members: Map<String, Member>,
    online: Boolean,
    live: Boolean,
    sync: SyncState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onAdd: (List<String>) -> Unit,
    onToggle: (ShoppingItem) -> Unit,
    onRemove: (ShoppingItem) -> Unit,
    onClearDone: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(),
    /** Souvent achetés, absents de la liste : ajoutés en un geste. */
    suggestions: List<String> = emptyList(),
    onAisle: (ShoppingItem, String) -> Unit = { _, _ -> },
    /** Menus de la semaine (null = inconnus, hors ligne). */
    meals: List<Meal>? = null,
    onMealsToShopping: (List<Meal>) -> Unit = {},
    onOpenMeals: () -> Unit = {},
) {
    var text by rememberSaveable { mutableStateOf("") }
    val submit = {
        val texts = splitShoppingItems(text)
        if (texts.isNotEmpty()) {
            onAdd(texts)
            text = ""
        }
    }
    val toBuy = items.filter { !it.done }
    val inCart = items.filter { it.done }
    var storeMode by rememberSaveable { mutableStateOf(false) }
    if (storeMode) StoreMode(items, onToggle) { storeMode = false }

    Column(Modifier.fillMaxSize().padding(contentPadding)) {
        Column(Modifier.padding(horizontal = 16.dp).padding(top = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.shopping_title),
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                LiveIndicator(live)
            }
            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it.take(2000) },
                    label = { Text(stringResource(R.string.shopping_add)) },
                    placeholder = { Text(stringResource(R.string.shopping_placeholder)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done, capitalization = KeyboardCapitalization.Sentences),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = submit, enabled = text.isNotBlank()) {
                    Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.shopping_add))
                }
            }
            if (suggestions.isNotEmpty()) {
                Text(
                    stringResource(R.string.shopping_suggestions),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(suggestions, key = { it }) { s ->
                        val label = stringResource(R.string.shopping_add_suggestion, s)
                        AssistChip(
                            onClick = { onAdd(listOf(s)) },
                            label = { Text(s) },
                            leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp)) },
                            modifier = Modifier.semantics { contentDescription = label },
                        )
                    }
                }
            }
            if (toBuy.isNotEmpty()) {
                OutlinedButton(onClick = { storeMode = true }, modifier = Modifier.padding(top = 8.dp).heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.store_open))
                }
            }
            SyncBanner(online, sync)
        }
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp)) {
                if (meals != null) item(key = "meals") { MealsCard(meals, onMealsToShopping, onOpenMeals) }
                if (items.isEmpty()) {
                    item { EmptyState(stringResource(R.string.shopping_empty_title), stringResource(R.string.shopping_empty_body)) }
                } else {
                    item { SectionHeader(stringResource(R.string.shopping_to_buy, toBuy.size)) }
                    if (toBuy.isEmpty()) {
                        item {
                            Text(
                                stringResource(R.string.shopping_all_done),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    // Rangé par rayon, dans l'ordre d'un parcours de magasin.
                    val byAisle = toBuy.groupBy { Aisles.of(it.aisle) }
                    Aisles.ORDER.filter { byAisle.containsKey(it) }.forEach { aisle ->
                        item(key = "aisle-$aisle") {
                            Text(
                                stringResource(Aisles.label(aisle)),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 8.dp).semantics { heading() },
                            )
                        }
                        items(byAisle.getValue(aisle), key = { it.id }) { ItemRow(it, null, onToggle, onRemove, onAisle) }
                    }
                    if (inCart.isNotEmpty()) {
                        item {
                            Row(verticalAlignment = Alignment.Bottom) {
                                SectionHeader(stringResource(R.string.shopping_in_cart, inCart.size), Modifier.weight(1f))
                                TextButton(onClick = onClearDone, modifier = Modifier.heightIn(min = 48.dp)) {
                                    Text(stringResource(R.string.shopping_clear))
                                }
                            }
                        }
                        items(inCart, key = { it.id }) { item ->
                            val by = item.doneById?.let(members::get)?.displayName
                            ItemRow(item, by?.let { stringResource(R.string.shopping_taken_by, it) }, onToggle, onRemove)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LiveIndicator(live: Boolean) {
    val color = if (live) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
        Text(
            stringResource(if (live) R.string.shopping_live else R.string.shopping_not_live),
            style = MaterialTheme.typography.labelMedium,
            color = color,
        )
    }
}

@Composable
private fun ItemRow(
    item: ShoppingItem,
    meta: String?,
    onToggle: (ShoppingItem) -> Unit,
    onRemove: (ShoppingItem) -> Unit,
    onAisle: ((ShoppingItem, String) -> Unit)? = null,
) {
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp)
            .toggleable(value = item.done, role = Role.Checkbox, onValueChange = { onToggle(item) }),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = item.done, onCheckedChange = null, modifier = Modifier.padding(horizontal = 12.dp))
        Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    item.text,
                    style = MaterialTheme.typography.bodyLarge,
                    textDecoration = if (item.done) TextDecoration.LineThrough else null,
                    color = if (item.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                )
                item.quantity?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            meta?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (onAisle != null) {
            Box {
                IconButton(onClick = { menu = true }) {
                    Icon(
                        painterResource(R.drawable.ic_aisle),
                        contentDescription = stringResource(R.string.shopping_aisle_of, item.text),
                    )
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    Aisles.ORDER.forEach { a ->
                        DropdownMenuItem(
                            text = { Text(stringResource(Aisles.label(a))) },
                            onClick = {
                                menu = false
                                if (a != Aisles.of(item.aisle)) onAisle(item, a)
                            },
                        )
                    }
                }
            }
        }
        IconButton(onClick = { onRemove(item) }) {
            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.shopping_remove, item.text))
        }
    }
}

/** Menus de la semaine : lecture, et ingrédients envoyés aux courses en un geste. */
@Composable
private fun MealsCard(meals: List<Meal>, onToShopping: (List<Meal>) -> Unit, onOpen: () -> Unit) {
    val locale = currentLocale()
    val pending = meals.filter { !it.inShopping && it.ingredients.isNotEmpty() }
    OutlinedCard(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                stringResource(R.string.meals_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics { heading() },
            )
            if (meals.isEmpty()) {
                Text(
                    stringResource(R.string.meals_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            meals.forEach { m ->
                val day = m.date.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, locale)
                val slot = stringResource(if (m.slot == "LUNCH") R.string.meals_lunch else R.string.meals_dinner)
                Text(
                    listOfNotNull("$day · $slot : ${m.title}", if (m.inShopping) "✓" else null).joinToString(" "),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (pending.isNotEmpty()) {
                    OutlinedButton(onClick = { onToShopping(pending) }, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(pluralStringResource(R.plurals.meals_to_shopping, pending.size, pending.size))
                    }
                }
                TextButton(onClick = onOpen, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.meals_edit_web))
                }
            }
        }
    }
}
