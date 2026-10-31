package app.tandem.foyer.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CategoryIconsTest {
    @Test
    fun `les emojis des categories par defaut ont chacun leur icone`() {
        val defaults = listOf("🏠", "🧹", "🍳", "🛒", "🧺", "🐾", "💰", "🚗", "🔧", "🌱", "👤", "❤️", "📦")
        defaults.forEach { assertNotNull("icône pour $it", CategoryIcons.forEmoji(it)) }
        assertEquals("couple", CategoryIcons.forEmoji("❤️"))
        assertEquals("money", CategoryIcons.forEmoji("💰"))
    }

    @Test
    fun `le selecteur de variante et les espaces sont ignores`() {
        assertEquals("couple", CategoryIcons.forEmoji("❤"))
        assertEquals("trash", CategoryIcons.forEmoji(" 🗑️ "))
    }

    @Test
    fun `un emoji inconnu ou vide n a pas d icone`() {
        assertNull(CategoryIcons.forEmoji("🎸"))
        assertNull(CategoryIcons.forEmoji(""))
        assertNull(CategoryIcons.forEmoji(null))
    }

    @Test
    fun `rayons, depenses et choix pointent vers des icones dessinees`() {
        listOf("PRODUCE", "BAKERY", "DAIRY", "MEAT_FISH", "FROZEN", "PANTRY", "DRINKS", "HOUSEHOLD", "HYGIENE", "OTHER")
            .forEach { assertTrue(it, CategoryIconData.icons.containsKey(CategoryIcons.forAisle(it))) }
        app.tandem.foyer.domain.Money.CATEGORIES
            .forEach { assertTrue(it, CategoryIconData.icons.containsKey(CategoryIcons.forExpense(it))) }
        CategoryIconData.picker.forEach { (key, emoji) -> assertEquals(key, CategoryIcons.forEmoji(emoji)) }
        assertEquals("groceries", CategoryIcons.forAisle("INCONNU"))
    }
}
