package app.tandem.foyer.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import app.tandem.foyer.ui.theme.Tokens

/** Choix d'icône : catégories et modèles gardent l'émoji en base, on lui associe une icône à l'affichage. */
object CategoryIcons {
    fun forEmoji(emoji: String?): String? {
        val e = emoji?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return CategoryIconData.byEmoji[e] ?: CategoryIconData.byEmoji[e.replace("️", "")]
    }

    fun forAisle(aisle: String): String = CategoryIconData.aisles[aisle] ?: "groceries"

    fun forExpense(category: String): String = CategoryIconData.expenses[category] ?: "box"
}

/**
 * Icône maison au trait (mêmes tracés que le web, cf. packages/design-tokens/category-icons.json) :
 * trait principal dans la couleur d'action, détail en abricot. Décorative : le nom l'accompagne.
 */
@Composable
fun CategoryIcon(
    key: String,
    modifier: Modifier = Modifier.size(20.dp),
    tint: Color = MaterialTheme.colorScheme.primary,
) {
    val glyph = CategoryIconData.icons[key] ?: return
    val main = remember(key) { glyph.paths.map { PathParser().parsePathString(it).toPath() } }
    val accent = remember(key) { glyph.accent.map { PathParser().parsePathString(it).toPath() } }
    Canvas(modifier.clearAndSetSemantics {}) {
        val s = size.minDimension / CategoryIconData.VIEWBOX
        val stroke = Stroke(width = CategoryIconData.STROKE, cap = StrokeCap.Round, join = StrokeJoin.Round)
        scale(s, s, pivot = Offset.Zero) {
            main.forEach { drawPath(it, tint, style = stroke) }
            accent.forEach { drawPath(it, Tokens.Brand.apricot, style = stroke) }
        }
    }
}

/** Icône d'une catégorie par son émoji enregistré ; un émoji sans icône connue reste affiché tel quel. */
@Composable
fun CategoryEmojiIcon(
    emoji: String?,
    modifier: Modifier = Modifier.size(20.dp),
    tint: Color = MaterialTheme.colorScheme.primary,
) {
    val key = CategoryIcons.forEmoji(emoji)
    when {
        key != null -> CategoryIcon(key, modifier, tint)
        !emoji.isNullOrBlank() -> Text(emoji, modifier.clearAndSetSemantics {})
    }
}
