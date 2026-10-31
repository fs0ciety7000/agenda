package app.tandem.foyer.ui.shopping

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import app.tandem.foyer.ui.components.PillChip
import app.tandem.foyer.ui.components.flatRow
import app.tandem.foyer.ui.theme.Tokens
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
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
    /** Bouton « Partager avec un invité » (cf. [GuestLinkButton]). */
    guestLink: @Composable () -> Unit = {},
    /** Bouton « Scanner un code-barres » (cf. [BarcodeButton]). */
    barcode: @Composable () -> Unit = {},
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

    // Puce de rayon choisie (null = tout) ; un rayon vidé revient à « Tout ».
    var aisleFilter by rememberSaveable { mutableStateOf<String?>(null) }
    val byAisle = toBuy.groupBy { Aisles.of(it.aisle) }
    val aisles = Aisles.ORDER.filter { byAisle.containsKey(it) }
    val current = aisleFilter?.takeIf { it in aisles }

    // Clavier ouvert : la barre d'ajout du bas remonte au-dessus de lui.
    Column(Modifier.fillMaxSize().padding(contentPadding).consumeWindowInsets(contentPadding).imePadding()) {
        Column(Modifier.padding(horizontal = 16.dp).padding(top = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        stringResource(R.string.shopping_title),
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier.semantics { heading() },
                    )
                    LiveIndicator(live)
                }
                if (toBuy.isNotEmpty()) {
                    Button(onClick = { storeMode = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                        Icon(painterResource(R.drawable.ic_store), contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.store_open))
                    }
                }
                guestLink()
            }
            SyncBanner(online, sync)
            if (aisles.size > 1) {
                LazyRow(
                    Modifier.padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item(key = "all") {
                        AisleChip(stringResource(R.string.shopping_aisle_all), toBuy.size, current == null) { aisleFilter = null }
                    }
                    items(aisles, key = { it }) { a ->
                        AisleChip(stringResource(Aisles.label(a)), byAisle.getValue(a).size, current == a) { aisleFilter = a }
                    }
                }
            }
        }
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = onRefresh, modifier = Modifier.weight(1f).fillMaxWidth()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
                if (items.isEmpty()) {
                    item { EmptyState(stringResource(R.string.shopping_empty_title), stringResource(R.string.shopping_empty_body), illustration = R.drawable.ill_empty_shopping) }
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
                    (current?.let(::listOf) ?: aisles).forEach { aisle ->
                        item(key = "aisle-$aisle") {
                            Text(
                                stringResource(Aisles.label(aisle)),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(top = 12.dp, bottom = 2.dp).semantics { heading() },
                            )
                        }
                        itemsIndexed(byAisle.getValue(aisle), key = { _, it -> it.id }) { i, it ->
                            ItemRow(it, null, onToggle, onRemove, onAisle, Modifier.flatRow(i))
                        }
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
                        itemsIndexed(inCart, key = { _, it -> it.id }) { i, item ->
                            val by = item.doneById?.let(members::get)?.displayName
                            ItemRow(item, by?.let { stringResource(R.string.shopping_taken_by, it) }, onToggle, onRemove, modifier = Modifier.flatRow(i))
                        }
                    }
                }
                // Menus de la semaine : une ligne en bas, plus un bloc qui repousse la liste.
                if (meals != null) item(key = "meals") { MealsRow(meals, onMealsToShopping, onOpenMeals) }
            }
        }
        // Barre d'ajout en bas, à portée du pouce ; suggestions juste au-dessus.
        if (suggestions.isNotEmpty()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(top = 8.dp),
            ) {
                items(suggestions, key = { it }) { s ->
                    val label = stringResource(R.string.shopping_add_suggestion, s)
                    AssistChip(
                        onClick = { onAdd(listOf(s)) },
                        label = { Text(s) },
                        leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp)) },
                        shape = CircleShape,
                        modifier = Modifier.semantics { contentDescription = label },
                    )
                }
            }
        }
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            shadowElevation = 8.dp,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Row(Modifier.padding(start = 4.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                TextField(
                    value = text,
                    onValueChange = { text = it.take(2000) },
                    placeholder = { Text(stringResource(R.string.shopping_add)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done, capitalization = KeyboardCapitalization.Sentences),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                    ),
                    modifier = Modifier.weight(1f),
                )
                if (text.isNotBlank()) {
                    FilledIconButton(onClick = submit, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.shopping_add))
                    }
                } else {
                    barcode()
                }
            }
        }
    }
}

@Composable
private fun AisleChip(label: String, count: Int, selected: Boolean, onClick: () -> Unit) =
    PillChip("$label  $count", selected, onClick)

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
    modifier: Modifier = Modifier,
) {
    var menu by remember { mutableStateOf(false) }
    Row(
        modifier.fillMaxWidth().heightIn(min = 56.dp)
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

/**
 * Menus de la semaine, en une ligne sous la liste : combien de repas sont prévus, et leurs
 * ingrédients envoyés aux courses en un geste. Le détail se lit et se modifie sur le site.
 */
@Composable
private fun MealsRow(meals: List<Meal>, onToShopping: (List<Meal>) -> Unit, onOpen: () -> Unit) {
    val pending = meals.filter { !it.inShopping && it.ingredients.isNotEmpty() }
    Row(
        Modifier.fillMaxWidth().padding(top = 20.dp).clip(RoundedCornerShape(Tokens.Radius.md))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onOpen)
            .padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp)
            .heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(painterResource(R.drawable.ic_meals), contentDescription = null, modifier = Modifier.size(20.dp))
        Text(
            if (meals.isEmpty()) stringResource(R.string.meals_empty)
            else pluralStringResource(R.plurals.meals_planned, meals.size, meals.size),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        if (pending.isNotEmpty()) {
            TextButton(onClick = { onToShopping(pending) }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(pluralStringResource(R.plurals.meals_to_shopping, pending.size, pending.size), fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
