package be.agendagn.app.di

import android.content.Context
import be.agendagn.app.BuildConfig
import be.agendagn.app.data.DataStoreSettingsStore
import be.agendagn.app.data.SettingsStore
import be.agendagn.app.data.auth.DataStoreTokenStore
import be.agendagn.app.data.auth.KeystoreCipher
import be.agendagn.app.data.auth.SharedPrefsPkceStore
import be.agendagn.app.data.local.AgendaDatabase
import be.agendagn.app.data.monitoring.CrashReporter
import be.agendagn.app.data.observeOnline
import be.agendagn.app.data.remote.ApiClient
import be.agendagn.app.data.repository.AgendaRepositoryImpl
import be.agendagn.app.data.repository.AuthRepositoryImpl
import be.agendagn.app.data.sync.SyncEngine
import be.agendagn.app.data.update.AppUpdater
import be.agendagn.app.data.sync.WorkManagerSyncScheduler
import be.agendagn.app.domain.repository.AgendaRepository
import be.agendagn.app.domain.repository.AuthRepository
import be.agendagn.app.notifications.ActivityNotifier
import be.agendagn.app.notifications.PushRegistrar
import be.agendagn.app.notifications.ReminderScheduler
import kotlinx.coroutines.flow.Flow

/**
 * Injection de dépendances manuelle : une dizaine d'objets, un seul graphe — Hilt n'apporterait
 * que du code généré et un temps de build plus long (règle anti-surconception).
 */
class AppContainer(context: Context) {
    private val app = context.applicationContext
    private val tokenStore = DataStoreTokenStore(app, KeystoreCipher())
    private val api = ApiClient.create(BuildConfig.API_BASE_URL, tokenStore)
    val database: AgendaDatabase = AgendaDatabase.create(app)
    val settings: SettingsStore = DataStoreSettingsStore(app)
    val syncScheduler = WorkManagerSyncScheduler(app)
    private val repositoryImpl = AgendaRepositoryImpl(api, database, SyncEngine(api, database, settings), syncScheduler)
    val repository: AgendaRepository = repositoryImpl
    val reminders = ReminderScheduler(app, repository, settings)
    val authRepository: AuthRepository = AuthRepositoryImpl(
        api,
        tokenStore,
        clearLocalData = { repositoryImpl.clearLocalData() },
        pkce = SharedPrefsPkceStore(app),
    )
    val online: Flow<Boolean> = app.observeOnline()
    val updater = AppUpdater(app, BuildConfig.UPDATE_MANIFEST_URL, BuildConfig.VERSION_CODE)
    val crashReporter = CrashReporter(app, api, BuildConfig.VERSION_NAME)
    val activityNotifier = ActivityNotifier(app, api)
    /** Notifications instantanées : actives seulement si la build contient la configuration Firebase. */
    val push = PushRegistrar.create(
        api, app, BuildConfig.FCM_APP_ID, BuildConfig.FCM_API_KEY, BuildConfig.FCM_PROJECT_ID, BuildConfig.FCM_SENDER_ID,
    )
    val webBaseUrl: String = BuildConfig.WEB_BASE_URL
}
