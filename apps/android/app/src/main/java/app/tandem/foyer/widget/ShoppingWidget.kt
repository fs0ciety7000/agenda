package app.tandem.foyer.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.CheckBox
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.material3.ColorProviders
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import app.tandem.foyer.AgendaApplication
import app.tandem.foyer.MainActivity
import app.tandem.foyer.R
import app.tandem.foyer.domain.model.ShoppingItem
import app.tandem.foyer.domain.repository.AgendaRepository
import app.tandem.foyer.ui.theme.DarkColors
import app.tandem.foyer.ui.theme.LightColors
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.first

private const val MAX_ITEMS = 20

/**
 * Widget « Courses » : ce qu'il reste à acheter, coché d'un geste au magasin (même file
 * d'envoi que l'app : fonctionne hors ligne). Toucher le titre ou « + » ouvre la liste.
 */
class ShoppingWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = shoppingContainer(context).repository
        val signedIn = repository.household.first() != null
        val items = repository.shopping.first().filter { !it.done }
        provideContent {
            GlanceTheme(colors = ColorProviders(light = LightColors, dark = DarkColors)) {
                ShoppingWidgetContent(signedIn, items)
            }
        }
    }

    companion object {
        @OptIn(FlowPreview::class)
        suspend fun keepUpdated(context: Context, repository: AgendaRepository) {
            repository.shopping.debounce(500).collect { ShoppingWidget().updateAll(context) }
        }
    }
}

class ShoppingWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ShoppingWidget()
}

/** Cocher depuis le widget : l'article passe dans le panier. */
class ToggleShoppingAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[ShoppingItemIdKey] ?: return
        val repository = shoppingContainer(context).repository
        repository.shopping.first().firstOrNull { it.id == id }?.let { repository.setShoppingDone(it, !it.done) }
        ShoppingWidget().updateAll(context)
    }
}

val ShoppingItemIdKey = ActionParameters.Key<String>("shoppingItemId")

private fun shoppingContainer(context: Context) = (context.applicationContext as AgendaApplication).container

private fun openShopping(context: Context) = actionStartActivity(
    Intent(context, MainActivity::class.java)
        .setAction(MainActivity.ACTION_OPEN_TAB)
        .putExtra(MainActivity.EXTRA_TAB, MainActivity.TAB_SHOPPING)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

@Composable
fun ShoppingWidgetContent(signedIn: Boolean, items: List<ShoppingItem>) {
    val context = LocalContext.current
    val colors = GlanceTheme.colors
    Column(GlanceModifier.fillMaxSize().background(colors.background).cornerRadius(20.dp).padding(12.dp)) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                context.getString(R.string.widget_shopping_name) + if (items.isNotEmpty()) " (${items.size})" else "",
                style = TextStyle(color = colors.onBackground, fontSize = 17.sp, fontWeight = FontWeight.Bold),
                modifier = GlanceModifier.defaultWeight().clickable(openShopping(context)),
            )
            if (signedIn) {
                Image(
                    ImageProvider(R.drawable.ic_widget_add),
                    contentDescription = context.getString(R.string.shopping_add),
                    colorFilter = androidx.glance.ColorFilter.tint(colors.onPrimary),
                    modifier = GlanceModifier.size(44.dp).background(colors.primary).cornerRadius(22.dp).padding(10.dp)
                        .clickable(openShopping(context)),
                )
            }
        }
        Spacer(GlanceModifier.height(8.dp))
        when {
            !signedIn -> WidgetMessage(context.getString(R.string.widget_signed_out))
            items.isEmpty() -> WidgetMessage(context.getString(R.string.widget_shopping_empty))
            else -> LazyColumn {
                items(items.take(MAX_ITEMS), itemId = { it.id.hashCode().toLong() }) { item ->
                    Row(GlanceModifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        CheckBox(
                            checked = false,
                            onCheckedChange = actionRunCallback<ToggleShoppingAction>(actionParametersOf(ShoppingItemIdKey to item.id)),
                            modifier = GlanceModifier.semantics { contentDescription = item.text },
                        )
                        Text(
                            item.text,
                            maxLines = 2,
                            style = TextStyle(color = colors.onBackground, fontSize = 15.sp),
                            modifier = GlanceModifier.defaultWeight().clickable(openShopping(context)),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun WidgetMessage(text: String) {
    val context = LocalContext.current
    Text(
        text,
        style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 14.sp),
        modifier = GlanceModifier.padding(vertical = 8.dp).clickable(openShopping(context)),
    )
}
