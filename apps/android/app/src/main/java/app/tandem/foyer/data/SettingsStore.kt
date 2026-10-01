package app.tandem.foyer.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

data class ReminderSettings(val enabled: Boolean = true, val leadMinutes: Int = 15)

/** Préférences locales (non sensibles) : rappels, propriétaire du cache, dernière synchronisation. */
interface SettingsStore {
    val reminders: Flow<ReminderSettings>
    val lastRefreshAt: Flow<Long?>
    /** Récapitulatif du matin (8 h), activé par défaut. */
    val morningRecap: Flow<Boolean>
    suspend fun setReminders(settings: ReminderSettings)
    suspend fun setMorningRecap(enabled: Boolean)
    /** Revue de la semaine, le dimanche soir (activée par défaut). */
    val weeklyReview: Flow<Boolean> get() = kotlinx.coroutines.flow.flowOf(true)
    suspend fun setWeeklyReview(enabled: Boolean) {}
    suspend fun setLastRefreshAt(millis: Long)
    suspend fun cacheOwner(): String?
    suspend fun setCacheOwner(userId: String?)
}

private val Context.settingsStore by preferencesDataStore(name = "settings")

class DataStoreSettingsStore(private val context: Context) : SettingsStore {
    private val remindersOn = booleanPreferencesKey("reminders_enabled")
    private val lead = intPreferencesKey("reminder_lead_minutes")
    private val lastRefresh = longPreferencesKey("last_refresh_at")
    private val owner = stringPreferencesKey("cache_owner")
    private val recap = booleanPreferencesKey("morning_recap")
    private val review = booleanPreferencesKey("weekly_review")

    override val reminders: Flow<ReminderSettings> = context.settingsStore.data.map {
        ReminderSettings(it[remindersOn] ?: true, it[lead] ?: 15)
    }
    override val lastRefreshAt: Flow<Long?> = context.settingsStore.data.map { it[lastRefresh] }
    override val morningRecap: Flow<Boolean> = context.settingsStore.data.map { it[recap] ?: true }

    override val weeklyReview: Flow<Boolean> = context.settingsStore.data.map { it[review] ?: true }

    override suspend fun setWeeklyReview(enabled: Boolean) {
        context.settingsStore.edit { it[review] = enabled }
    }

    override suspend fun setMorningRecap(enabled: Boolean) {
        context.settingsStore.edit { it[recap] = enabled }
    }

    override suspend fun setReminders(settings: ReminderSettings) {
        context.settingsStore.edit {
            it[remindersOn] = settings.enabled
            it[lead] = settings.leadMinutes
        }
    }

    override suspend fun setLastRefreshAt(millis: Long) {
        context.settingsStore.edit { it[lastRefresh] = millis }
    }

    override suspend fun cacheOwner(): String? = context.settingsStore.data.first()[owner]

    override suspend fun setCacheOwner(userId: String?) {
        context.settingsStore.edit { if (userId == null) it.remove(owner) else it[owner] = userId }
    }
}
