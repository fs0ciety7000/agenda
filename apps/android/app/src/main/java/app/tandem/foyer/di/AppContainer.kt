package app.tandem.foyer.di

import android.content.Context
import app.tandem.foyer.BuildConfig
import app.tandem.foyer.data.DataStoreSettingsStore
import app.tandem.foyer.data.SettingsStore
import app.tandem.foyer.data.auth.DataStoreTokenStore
import app.tandem.foyer.data.auth.KeystoreCipher
import app.tandem.foyer.data.auth.SharedPrefsPkceStore
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.monitoring.CrashReporter
import app.tandem.foyer.data.observeOnline
import app.tandem.foyer.data.remote.ApiClient
import app.tandem.foyer.data.remote.RealtimeClient
import app.tandem.foyer.data.repository.AgendaRepositoryImpl
import app.tandem.foyer.data.repository.AuthRepositoryImpl
import app.tandem.foyer.data.sync.SyncEngine
import app.tandem.foyer.data.update.AppUpdater
import app.tandem.foyer.data.sync.WorkManagerSyncScheduler
import app.tandem.foyer.domain.repository.AgendaRepository
import app.tandem.foyer.domain.repository.AuthRepository
import app.tandem.foyer.notifications.ActivityNotifier
import app.tandem.foyer.notifications.PushRegistrar
import app.tandem.foyer.notifications.RecapScheduler
import app.tandem.foyer.notifications.ReminderScheduler
import kotlinx.coroutines.flow.Flow

/**
 * Injection de dépendances manuelle : une dizaine d'objets, un seul graphe — Hilt n'apporterait
 * que du code généré et un temps de build plus long (règle anti-surconception).
 */
class AppContainer(context: Context) {
    private val app = context.applicationContext
    private val tokenStore = DataStoreTokenStore(app, KeystoreCipher())
    private val clients = ApiClient.createWithClient(BuildConfig.API_BASE_URL, tokenStore)
    private val api = clients.first
    val realtime = RealtimeClient(BuildConfig.API_BASE_URL, clients.second)
    val database: AgendaDatabase = AgendaDatabase.create(app)
    val settings: SettingsStore = DataStoreSettingsStore(app)
    val syncScheduler = WorkManagerSyncScheduler(app)
    val attachments = app.tandem.foyer.data.files.AttachmentFiles(api, database, app.cacheDir)
    private val repositoryImpl = AgendaRepositoryImpl(api, database, SyncEngine(api, database, settings), syncScheduler)
    val repository: AgendaRepository = repositoryImpl
    val activity = app.tandem.foyer.data.ActivityRemote(api, database) { repositoryImpl.refresh() }
    val absences = app.tandem.foyer.data.AbsencesRemote(api, database) { repositoryImpl.refresh() }
    val comments = app.tandem.foyer.data.CommentsRemote(api, database)
    val reports = app.tandem.foyer.data.ReportsRemote(app, api, database)
    val reminders = ReminderScheduler(app, repository, settings)
    val recap = RecapScheduler(app, settings)
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
