package app.tandem.foyer.tile

import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.MainActivity
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric

/** Tuile des réglages rapides : ouvre l'ajout rapide de l'app. */
@RunWith(AndroidJUnit4::class)
class QuickAddTileServiceTest {
    @Test
    fun ouvre_l_ajout_rapide() {
        val service = Robolectric.buildService(QuickAddTileService::class.java).create().get()
        val intent = service.quickAddIntent()
        assertEquals(MainActivity.ACTION_QUICK_ADD, intent.action)
        assertEquals(MainActivity::class.java.name, intent.component?.className)
    }
}
