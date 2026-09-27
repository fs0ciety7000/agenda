package be.agendagn.app

import androidx.core.content.FileProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Pièces jointes et photos : le FileProvider déclaré dans le manifeste partage bien les fichiers
 * du cache (ouverture dans une autre app, appareil photo).
 */
@RunWith(AndroidJUnit4::class)
class AttachmentProviderTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val authority = "${context.packageName}.attachments"

    @Test
    fun fichiersDuCacheLisiblesParUri() {
        for (dir in listOf("attachments", "camera")) {
            val file = File(File(context.cacheDir, dir).apply { mkdirs() }, "facture test.pdf")
            val bytes = byteArrayOf(0x25, 0x50, 0x44, 0x46)
            file.writeBytes(bytes)
            val uri = FileProvider.getUriForFile(context, authority, file)
            assertEquals("content", uri.scheme)
            assertEquals(authority, uri.authority)
            val read = context.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
            assertArrayEquals(bytes, read)
            file.delete()
        }
    }
}
