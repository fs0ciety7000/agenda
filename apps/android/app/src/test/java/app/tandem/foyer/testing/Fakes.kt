package app.tandem.foyer.testing

import app.tandem.foyer.data.ReminderSettings
import app.tandem.foyer.data.SettingsStore
import app.tandem.foyer.data.auth.TokenStore
import app.tandem.foyer.data.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

class FakeTokenStore(access: String? = "access", refresh: String? = "refresh") : TokenStore {
    private val state = MutableStateFlow(access to refresh)
    override val hasSession: Flow<Boolean> = state.map { it.second != null }
    override suspend fun accessToken() = state.value.first
    override suspend fun refreshToken() = state.value.second
    override suspend fun save(accessToken: String, refreshToken: String) { state.value = accessToken to refreshToken }
    override suspend fun clear() { state.value = null to null }
}

class FakeSettingsStore : SettingsStore {
    val remindersState = MutableStateFlow(ReminderSettings())
    var owner: String? = null
    var lastRefresh = MutableStateFlow<Long?>(null)
    override val reminders: Flow<ReminderSettings> = remindersState
    override val lastRefreshAt: Flow<Long?> = lastRefresh
    val recapState = MutableStateFlow(true)
    override val morningRecap: Flow<Boolean> = recapState
    override suspend fun setMorningRecap(enabled: Boolean) { recapState.value = enabled }
    override suspend fun setReminders(settings: ReminderSettings) { remindersState.value = settings }
    override suspend fun setLastRefreshAt(millis: Long) { lastRefresh.value = millis }
    override suspend fun cacheOwner() = owner
    override suspend fun setCacheOwner(userId: String?) { owner = userId }
}

class FakeScheduler : SyncScheduler {
    var requests = 0
    override fun requestSync() { requests++ }
    override fun schedulePeriodic() = Unit
    override fun cancelAll() = Unit
}
