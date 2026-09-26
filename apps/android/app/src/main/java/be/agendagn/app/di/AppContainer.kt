package be.agendagn.app.di

import android.content.Context
import be.agendagn.app.BuildConfig
import be.agendagn.app.data.auth.DataStoreTokenStore
import be.agendagn.app.data.auth.KeystoreCipher
import be.agendagn.app.data.remote.ApiClient
import be.agendagn.app.data.repository.AuthRepositoryImpl
import be.agendagn.app.domain.repository.AuthRepository

/**
 * Injection de dépendances manuelle : suffisante pour la taille actuelle de l'app.
 * Migration vers Hilt envisageable quand le graphe grossira (Phase 5 : Room, WorkManager).
 */
class AppContainer(context: Context) {
    private val tokenStore = DataStoreTokenStore(context.applicationContext, KeystoreCipher())
    private val api = ApiClient.create(BuildConfig.API_BASE_URL, tokenStore)
    val authRepository: AuthRepository = AuthRepositoryImpl(api, tokenStore)
}
