package be.agendagn.app.data.auth

import android.content.Context
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Verifier PKCE du flux « Continuer avec Google » : conservé sur le téléphone (y compris si
 * Android ferme l'app pendant que l'onglet Google est ouvert), lu une seule fois, 10 min maximum.
 */
interface PkceStore {
    fun create(): Pair<String, String>
    fun take(): String?
}

object Pkce {
    fun verifier(random: SecureRandom = SecureRandom()): String =
        ByteArray(32).also(random::nextBytes).let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP) }

    fun challenge(verifier: String): String =
        MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
            .let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP) }
}

class SharedPrefsPkceStore(context: Context, private val now: () -> Long = System::currentTimeMillis) : PkceStore {
    private val prefs = context.getSharedPreferences("pkce", Context.MODE_PRIVATE)

    /** Renvoie (verifier, challenge). */
    override fun create(): Pair<String, String> {
        val verifier = Pkce.verifier()
        prefs.edit().putString(KEY, verifier).putLong(AT, now()).apply()
        return verifier to Pkce.challenge(verifier)
    }

    override fun take(): String? {
        val verifier = prefs.getString(KEY, null)
        val fresh = now() - prefs.getLong(AT, 0) < TTL_MS
        prefs.edit().clear().apply()
        return verifier?.takeIf { fresh }
    }

    private companion object {
        const val KEY = "verifier"
        const val AT = "created_at"
        const val TTL_MS = 10 * 60_000L
    }
}
