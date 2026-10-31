package app.tandem.foyer.ui.settings

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.data.ReminderSettings
import app.tandem.foyer.domain.model.CalendarLinkState
import app.tandem.foyer.domain.model.CalendarStatus
import app.tandem.foyer.domain.model.User
import app.tandem.foyer.ui.components.MemberAvatar
import app.tandem.foyer.notifications.PushState
import app.tandem.foyer.ui.components.SectionHeader
import app.tandem.foyer.ui.main.AgendaUiState

@Composable
fun SettingsScreen(
    state: AgendaUiState,
    user: User?,
    calendar: CalendarStatus?,
    reminders: ReminderSettings,
    notificationsAllowed: Boolean,
    version: String,
    onReminders: (ReminderSettings) -> Unit,
    onRequestNotifications: () -> Unit,
    onOpenWeb: (path: String) -> Unit,
    onSignOut: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(),
    /** Zone « À propos » : mise à jour de l'app. */
    update: @Composable () -> Unit = {},
    /** Diagnostic des notifications instantanées (null = masqué). */
    push: PushState? = null,
    morningRecap: Boolean = true,
    onMorningRecap: (Boolean) -> Unit = {},
    weeklyReview: Boolean = true,
    onWeeklyReview: (Boolean) -> Unit = {},
    onRetryPush: () -> Unit = {},
    /** Langue de l'app : "" (téléphone), "fr", "en" ou "nl". */
    language: String = "",
    onLanguage: (String) -> Unit = {},
    /** Compte : appareils connectés (liste en ligne). */
    devices: @Composable () -> Unit = {},
    /** Compte : passkeys (cf. [PasskeysSection]). */
    passkeys: @Composable () -> Unit = {},
    /** Section « Sauvegarde du foyer » (cf. [BackupSection]). */
    backup: @Composable () -> Unit = {},
    /** Rubrique ouverte au départ (null = sommaire) : captures et tests. */
    initialSection: SettingsSection? = null,

) {
    var confirmSignOut by remember { mutableStateOf(false) }
    var section by rememberSaveable { mutableStateOf(initialSection) }
    // Le geste retour ferme d'abord la rubrique ouverte, puis quitte les Réglages.
    BackHandler(enabled = section != null) { section = null }
    Column(
        Modifier.fillMaxSize().padding(contentPadding).verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 32.dp),
    ) {
        val open = section
        if (open == null) {
            // Les pages du foyer (Dépenses, Notes…) sont dans le tiroir « Plus » de la barre du bas.
            Text(
                stringResource(R.string.nav_settings),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            Row(
                Modifier.padding(top = 20.dp, bottom = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy((-12).dp)) {
                    state.household?.members.orEmpty().take(3).forEach { MemberAvatar(it, 40) }
                }
                Column(Modifier.weight(1f)) {
                    Text(state.household?.name.orEmpty(), style = MaterialTheme.typography.titleMedium)
                    user?.let {
                        Text(it.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            OutlinedCard(Modifier.fillMaxWidth()) {
                SettingsSection.entries.forEachIndexed { i, s ->
                    if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    SectionRow(s) { section = s }
                }
            }
            Text(
                stringResource(R.string.version, version),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 24.dp),
            )
            update()
        } else {
            TextButton(onClick = { section = null }, modifier = Modifier.heightIn(min = 48.dp)) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null)
                Text(stringResource(R.string.nav_settings))
            }
            Text(
                stringResource(open.title),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            when (open) {
                SettingsSection.HOUSEHOLD -> HouseholdSection(state, onOpenWeb)
                SettingsSection.ACCOUNT -> {
                    SectionHeader(stringResource(R.string.settings_account))
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            user?.let {
                                Text(it.displayName, style = MaterialTheme.typography.titleMedium)
                                Text(it.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            TextButton(onClick = { confirmSignOut = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                                Text(stringResource(R.string.sign_out), color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                    OutlinedCard(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                        Column(Modifier.padding(16.dp)) { passkeys() }
                    }
                    OutlinedCard(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                        Column(Modifier.padding(16.dp)) { devices() }
                    }
                }
                SettingsSection.PREFERENCES -> PreferencesSection(
                    calendar, reminders, notificationsAllowed, onReminders, onRequestNotifications, onOpenWeb,
                    push, morningRecap, onMorningRecap, weeklyReview, onWeeklyReview, onRetryPush, language, onLanguage,
                )
                SettingsSection.DATA -> {
                    OutlinedCard(Modifier.fillMaxWidth().padding(top = 16.dp)) {
                        Column(Modifier.padding(16.dp)) { backup() }
                    }
                    SectionHeader(stringResource(R.string.settings_help))
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            OutlinedButton(onClick = { onOpenWeb("") }, modifier = Modifier.heightIn(min = 48.dp)) {
                                Text(stringResource(R.string.open_website))
                            }
                            TextButton(onClick = { onOpenWeb("help") }, modifier = Modifier.heightIn(min = 48.dp)) {
                                Text(stringResource(R.string.report_faq))
                            }
                            TextButton(onClick = { onOpenWeb("privacy") }, modifier = Modifier.heightIn(min = 48.dp)) {
                                Text(stringResource(R.string.privacy_policy))
                            }
                            TextButton(onClick = { onOpenWeb("settings/data") }, modifier = Modifier.heightIn(min = 48.dp)) {
                                Text(stringResource(R.string.settings_data_web))
                            }
                        }
                    }
                }
            }
        }
    }
    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text(stringResource(R.string.sign_out)) },
            text = { if (state.sync.pending > 0) Text(stringResource(R.string.sign_out_confirm)) },
            confirmButton = {
                TextButton(onClick = { confirmSignOut = false; onSignOut() }) { Text(stringResource(R.string.sign_out)) }
            },
            dismissButton = { TextButton(onClick = { confirmSignOut = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

/** Les quatre rubriques des Réglages, dans l'ordre du site. */
enum class SettingsSection(@StringRes val title: Int, @StringRes val hint: Int) {
    HOUSEHOLD(R.string.settings_section_household, R.string.settings_section_household_hint),
    ACCOUNT(R.string.settings_section_account, R.string.settings_section_account_hint),
    PREFERENCES(R.string.settings_section_preferences, R.string.settings_section_preferences_hint),
    DATA(R.string.settings_section_data, R.string.settings_section_data_hint),
}

@Composable
private fun SectionRow(section: SettingsSection, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(stringResource(section.title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(stringResource(section.hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Foyer : les membres ; catégories, modèles et ajout par e-mail se règlent sur le site. */
@Composable
private fun HouseholdSection(state: AgendaUiState, onOpenWeb: (String) -> Unit) {
    SectionHeader(stringResource(R.string.settings_household))
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(state.household?.name.orEmpty(), style = MaterialTheme.typography.titleMedium)
            state.household?.members?.forEach { m ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MemberAvatar(m, 32)
                    Text(m.displayName, style = MaterialTheme.typography.bodyLarge)
                }
            }
            Text(
                stringResource(R.string.settings_household_web_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(onClick = { onOpenWeb("settings/household") }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.settings_household_web))
            }
        }
    }
}

/** Préférences : calendrier, rappels, notifications, langue. */
@Composable
private fun PreferencesSection(
    calendar: CalendarStatus?,
    reminders: ReminderSettings,
    notificationsAllowed: Boolean,
    onReminders: (ReminderSettings) -> Unit,
    onRequestNotifications: () -> Unit,
    onOpenWeb: (path: String) -> Unit,
    push: PushState?,
    morningRecap: Boolean,
    onMorningRecap: (Boolean) -> Unit,
    weeklyReview: Boolean,
    onWeeklyReview: (Boolean) -> Unit,
    onRetryPush: () -> Unit,
    language: String,
    onLanguage: (String) -> Unit,
) {
    SectionHeader(stringResource(R.string.settings_calendar))
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val c = calendar
            Text(
                when {
                    c == null -> stringResource(R.string.calendar_unknown)
                    c.state == CalendarLinkState.ACTIVE -> "✓ " + stringResource(R.string.calendar_active, c.calendarName.orEmpty())
                    c.state == CalendarLinkState.INVALID -> stringResource(R.string.calendar_invalid, c.calendarName.orEmpty())
                    c.state == CalendarLinkState.NOT_CONFIGURED -> stringResource(R.string.calendar_not_configured)
                    else -> stringResource(R.string.calendar_not_linked)
                },
                style = MaterialTheme.typography.bodyLarge,
                color = if (c?.state == CalendarLinkState.INVALID) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            )
            if (c != null && c.state == CalendarLinkState.ACTIVE) {
                c.connectionEmail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Text(
                    stringResource(R.string.calendar_stats, c.synced, c.pending, c.errors),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                stringResource(R.string.calendar_web_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(onClick = { onOpenWeb("settings/preferences") }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.calendar_manage_web))
            }
        }
    }

    SectionHeader(stringResource(R.string.settings_reminders))
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                    value = reminders.enabled,
                    role = Role.Switch,
                    onValueChange = { onReminders(reminders.copy(enabled = it)) },
                ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.reminders_enabled), modifier = Modifier.weight(1f))
                Switch(checked = reminders.enabled, onCheckedChange = null)
            }
            if (reminders.enabled) {
                Text(
                    stringResource(R.string.reminders_lead),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(0, 5, 15, 30, 60).forEach { m ->
                        FilterChip(
                            selected = reminders.leadMinutes == m,
                            onClick = { onReminders(reminders.copy(leadMinutes = m)) },
                            label = { Text(if (m == 0) stringResource(R.string.reminders_at_time) else stringResource(R.string.minutes, m)) },
                        )
                    }
                }
            }
        }
    }

    // Rappels locaux comme notifications instantanées ont besoin de l'autorisation Android.
    SectionHeader(stringResource(R.string.settings_notifications))
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                    value = morningRecap,
                    role = Role.Switch,
                    onValueChange = onMorningRecap,
                ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.recap_setting), modifier = Modifier.weight(1f))
                Switch(checked = morningRecap, onCheckedChange = null)
            }
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                    value = weeklyReview,
                    role = Role.Switch,
                    onValueChange = onWeeklyReview,
                ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.review_setting), modifier = Modifier.weight(1f))
                Switch(checked = weeklyReview, onCheckedChange = null)
            }
            if (!notificationsAllowed) {
                Text(
                    stringResource(R.string.reminders_permission_denied),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                TextButton(onClick = onRequestNotifications, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.reminders_permission))
                }
            }
            push?.let { PushStatusRow(it, onRetryPush) }
            TextButton(onClick = { onOpenWeb("settings/preferences") }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.notification_preferences))
            }
        }
    }

    SectionHeader(stringResource(R.string.settings_language))
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Noms des langues dans leur propre langue : jamais traduits.
        listOf(
            "" to stringResource(R.string.language_system),
            "fr" to "Français",
            "en" to "English",
            "nl" to "Nederlands",
        ).forEach { (tag, name) ->
            FilterChip(selected = language == tag, onClick = { onLanguage(tag) }, label = { Text(name) })
        }
    }
}

/** « Notifications instantanées » : ce que ce téléphone sait de son enregistrement. */
@Composable
private fun PushStatusRow(state: PushState, onRetry: () -> Unit) {
    val (text, problem) = when (state) {
        PushState.Registered -> stringResource(R.string.push_registered) to false
        PushState.Pending -> stringResource(R.string.push_pending) to false
        PushState.NotInBuild -> stringResource(R.string.push_not_in_build) to true
        PushState.Offline -> stringResource(R.string.push_offline) to true
        is PushState.TokenError -> stringResource(R.string.push_token_error, state.message) to true
        is PushState.ServerError -> stringResource(R.string.push_server_error, state.code) to true
    }
    Column(Modifier.padding(vertical = 8.dp)) {
        Text(stringResource(R.string.push_title), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            color = if (problem) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (state is PushState.Offline || state is PushState.TokenError || state is PushState.ServerError) {
            TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.push_retry)) }
        }
    }
}
