package be.agendagn.app.data.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

interface TokenStore {
    val hasSession: Flow<Boolean>
    suspend fun accessToken(): String?
    suspend fun refreshToken(): String?
    suspend fun save(accessToken: String, refreshToken: String)
    suspend fun clear()
}

private val Context.authStore by preferencesDataStore(name = "auth")

/** Jetons chiffrés (Keystore) dans DataStore ; exclus des sauvegardes (data_extraction_rules). */
class DataStoreTokenStore(private val context: Context, private val cipher: KeystoreCipher) : TokenStore {
    private val accessKey = stringPreferencesKey("access")
    private val refreshKey = stringPreferencesKey("refresh")

    override val hasSession: Flow<Boolean> = context.authStore.data.map { it[refreshKey] != null }

    override suspend fun accessToken(): String? =
        context.authStore.data.first()[accessKey]?.let(cipher::decrypt)

    override suspend fun refreshToken(): String? =
        context.authStore.data.first()[refreshKey]?.let(cipher::decrypt)

    override suspend fun save(accessToken: String, refreshToken: String) {
        context.authStore.edit {
            it[accessKey] = cipher.encrypt(accessToken)
            it[refreshKey] = cipher.encrypt(refreshToken)
        }
    }

    override suspend fun clear() {
        context.authStore.edit { it.clear() }
    }
}
