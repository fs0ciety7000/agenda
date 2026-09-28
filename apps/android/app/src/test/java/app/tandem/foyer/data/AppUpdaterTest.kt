package app.tandem.foyer.data

import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.tandem.foyer.data.update.AppUpdater
import app.tandem.foyer.data.update.UpdateState
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import java.security.MessageDigest

@RunWith(AndroidJUnit4::class)
class AppUpdaterTest {
    private val server = MockWebServer().apply { start() }
    private val apk = ByteArray(200_000) { (it % 251).toByte() }
    private val sha = MessageDigest.getInstance("SHA-256").digest(apk).joinToString("") { "%02x".format(it) }

    @After fun tearDown() = server.shutdown()

    /** MockWebServer est en HTTP : on le fait passer pour du HTTPS (seul accepté par l'updater). */
    private val http = OkHttpClient.Builder().addInterceptor { chain ->
        val req = chain.request()
        chain.proceed(req.newBuilder().url(req.url.newBuilder().scheme("http").port(server.port).host(server.hostName).build()).build())
    }.build()

    private fun updater(current: Int) =
        AppUpdater(ApplicationProvider.getApplicationContext(), "https://updates.test/version.json", current, http)

    private fun manifest(code: Int, sha256: String = sha) =
        MockResponse().setBody("""{"versionCode":$code,"versionName":"0.3.$code","apkUrl":"https://updates.test/tandem.apk","sha256":"$sha256"}""")

    @Test
    fun `propose uniquement une version plus recente`() = runBlocking {
        server.enqueue(manifest(12))
        assertNull(updater(12).check())
        server.enqueue(manifest(13))
        val u = updater(12)
        assertEquals("0.3.13", u.check()!!.versionName)
        assertEquals("0.3.13", u.available.value!!.versionName)
        server.enqueue(MockResponse().setResponseCode(404))
        assertNull(updater(12).check()) // release absente : silencieux
    }

    @Test
    fun `telecharge, verifie le SHA-256 et prepare l installeur`() = runBlocking {
        val u = updater(12)
        server.enqueue(manifest(13))
        val m = u.check()!!
        server.enqueue(MockResponse().setBody(Buffer().write(apk)))
        val intent = u.download(m)
        assertNotNull(intent)
        assertEquals(Intent.ACTION_VIEW, intent!!.action)
        assertEquals("application/vnd.android.package-archive", intent.type)
        assertEquals(UpdateState.Idle, u.state.value)
    }

    @Test
    fun `empreinte differente - fichier rejete`() = runBlocking {
        val u = updater(12)
        server.enqueue(manifest(13, "0".repeat(64)))
        val m = u.check()!!
        server.enqueue(MockResponse().setBody(Buffer().write(apk)))
        assertNull(u.download(m))
        assertEquals(UpdateState.Failed, u.state.value)
    }
}
