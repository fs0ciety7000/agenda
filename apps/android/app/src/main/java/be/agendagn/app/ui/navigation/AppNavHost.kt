package be.agendagn.app.ui.navigation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import be.agendagn.app.BuildConfig
import be.agendagn.app.R
import be.agendagn.app.data.ReminderSettings
import be.agendagn.app.di.AppContainer
import be.agendagn.app.domain.Agenda
import be.agendagn.app.domain.model.CalendarLinkState
import be.agendagn.app.domain.model.CalendarStatus
import be.agendagn.app.domain.model.User
import be.agendagn.app.ui.calendar.CalendarScreen
import be.agendagn.app.ui.login.LoginScreen
import be.agendagn.app.ui.login.LoginViewModel
import be.agendagn.app.ui.main.AgendaViewModel
import be.agendagn.app.ui.quickadd.QuickAddSheet
import be.agendagn.app.ui.settings.SettingsScreen
import be.agendagn.app.ui.taskform.TaskFormScreen
import be.agendagn.app.ui.taskform.TaskFormViewModel
import be.agendagn.app.ui.tasks.TasksScreen
import be.agendagn.app.ui.today.TodayScreen
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

/** Racine : l'état de session décide de l'écran (connexion ou application). */
@Composable
fun AppNavHost(container: AppContainer, openOccurrenceId: String? = null) {
    val signedIn by container.authRepository.isSignedIn.collectAsStateWithLifecycle(initialValue = null)
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when (signedIn) {
            null -> Unit
            false -> {
                val vm: LoginViewModel = viewModel(factory = viewModelFactory { initializer { LoginViewModel(container.authRepository) } })
                val context = LocalContext.current
                LoginScreen(
                    viewModel = vm,
                    onSignedIn = {},
                    onOpenWeb = { path -> openWeb(context, container.webBaseUrl, path) },
                )
            }
            true -> MainScaffold(container, openOccurrenceId)
        }
    }
}

fun openWeb(context: Context, base: String, path: String) {
    CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(base + path))
}

private enum class Tab(val route: String, val label: Int) {
    TODAY("today", R.string.nav_today),
    TASKS("tasks", R.string.nav_tasks),
    CALENDAR("calendar", R.string.nav_calendar),
    SETTINGS("settings", R.string.nav_settings),
}

@Composable
private fun MainScaffold(container: AppContainer, openOccurrenceId: String?) {
    val context = LocalContext.current
    val vm: AgendaViewModel = viewModel(
        factory = viewModelFactory { initializer { AgendaViewModel(container.repository, container.online) } },
    )
    val state by vm.state.collectAsStateWithLifecycle()
    val quickAdd by vm.quickAdd.collectAsStateWithLifecycle()
    val reminders by container.settings.reminders.collectAsStateWithLifecycle(initialValue = ReminderSettings())
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val scope = rememberCoroutineScope()

    var showQuickAdd by rememberSaveable { mutableStateOf(false) }
    var filter by remember { mutableStateOf(Agenda.Filter()) }
    var month by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    var selectedDay by rememberSaveable { mutableStateOf<String?>(null) }
    var calendar by remember { mutableStateOf<CalendarStatus?>(null) }
    var user by remember { mutableStateOf<User?>(null) }
    var notificationsAllowed by remember { mutableStateOf(notificationsGranted(context)) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        notificationsAllowed = it
    }

    LaunchedEffect(state.household?.id) {
        if (state.household != null) calendar = container.repository.calendarStatus()
    }
    LaunchedEffect(Unit) {
        user = container.authRepository.currentUser()
        // Rappels activés par défaut : on demande l'autorisation une fois, dans le contexte.
        if (!notificationsAllowed && Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
    LaunchedEffect(openOccurrenceId) { openOccurrenceId?.let { nav.navigate("task/$it") } }

    val tabs = Tab.entries
    val onTab = route in tabs.map { it.route }
    val open = { id: String -> nav.navigate("task/$id") }

    if (state.loaded && state.household == null) {
        NoHousehold { openWeb(context, container.webBaseUrl, "onboarding") }
        return
    }

    Scaffold(
        bottomBar = {
            if (onTab) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                Icon(
                                    when (tab) {
                                        Tab.TODAY -> Icons.Filled.Home
                                        Tab.TASKS -> Icons.AutoMirrored.Filled.List
                                        Tab.CALENDAR -> Icons.Filled.DateRange
                                        Tab.SETTINGS -> Icons.Filled.Settings
                                    },
                                    contentDescription = null,
                                )
                            },
                            label = { Text(stringResource(tab.label)) },
                        )
                    }
                }
            }
        },
        floatingActionButton = {
            if (onTab && route != Tab.SETTINGS.route) {
                FloatingActionButton(onClick = { showQuickAdd = true }) {
                    Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.quick_add))
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = Tab.TODAY.route) {
            composable(Tab.TODAY.route) {
                TodayScreen(
                    state, vm::refresh, vm::toggle, { open(it.id) },
                    onShowUnscheduled = {
                        filter = filter.copy(view = Agenda.View.UNSCHEDULED)
                        nav.navigate(Tab.TASKS.route) { launchSingleTop = true }
                    },
                    contentPadding = padding,
                )
            }
            composable(Tab.TASKS.route) {
                TasksScreen(state, filter, { filter = it }, vm::refresh, vm::toggle, { open(it.id) }, contentPadding = padding)
            }
            composable(Tab.CALENDAR.route) {
                CalendarScreen(
                    state = state,
                    month = YearMonth.parse(month),
                    selected = selectedDay?.let(LocalDate::parse) ?: state.today,
                    onMonth = { month = it.toString() },
                    onSelect = { selectedDay = it.toString() },
                    onToggle = vm::toggle,
                    onOpen = { open(it.id) },
                    onAddOn = { nav.navigate("new?date=$it") },
                    contentPadding = padding,
                )
            }
            composable(Tab.SETTINGS.route) {
                LaunchedEffect(Unit) { calendar = container.repository.calendarStatus() ?: calendar }
                SettingsScreen(
                    state = state,
                    user = user,
                    calendar = calendar,
                    reminders = reminders,
                    notificationsAllowed = notificationsAllowed,
                    version = BuildConfig.VERSION_NAME,
                    onReminders = { scope.launch { container.settings.setReminders(it) } },
                    onRequestNotifications = {
                        if (Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    },
                    onOpenWeb = { openWeb(context, container.webBaseUrl, it) },
                    onSignOut = { scope.launch { container.authRepository.logout() } },
                    contentPadding = padding,
                )
            }
            composable("task/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                val id = entry.arguments?.getString("id")
                TaskForm(container, id, null, state, calendar) { nav.popBackStack() }
            }
            composable("new?date={date}", arguments = listOf(navArgument("date") { type = NavType.StringType; nullable = true })) { entry ->
                val date = entry.arguments?.getString("date")?.let(LocalDate::parse)
                TaskForm(container, null, date, state, calendar) { nav.popBackStack() }
            }
        }
    }

    if (showQuickAdd) {
        QuickAddSheet(
            state = quickAdd,
            online = state.online,
            members = state.members,
            today = state.today,
            onText = vm::onQuickAddText,
            onSubmit = { if (vm.submitQuickAdd()) showQuickAdd = false },
            onFullForm = {
                showQuickAdd = false
                nav.navigate("new")
            },
            onDismiss = { showQuickAdd = false },
        )
    }
}

@Composable
private fun TaskForm(
    container: AppContainer,
    occurrenceId: String?,
    date: LocalDate?,
    state: be.agendagn.app.ui.main.AgendaUiState,
    calendar: CalendarStatus?,
    onBack: () -> Unit,
) {
    val vm: TaskFormViewModel = viewModel(
        key = "form-$occurrenceId-$date",
        factory = viewModelFactory { initializer { TaskFormViewModel(container.repository, occurrenceId, date) } },
    )
    val form by vm.state.collectAsStateWithLifecycle()
    TaskFormScreen(
        state = form,
        members = state.household?.members.orEmpty(),
        categories = state.categories,
        calendarAvailable = calendar?.state == CalendarLinkState.ACTIVE,
        onEdit = vm::edit,
        onSave = {
            // Création sans calendrier partagé actif (ou état inconnu hors ligne) : pas de synchro implicite.
            if (occurrenceId == null && calendar?.state != CalendarLinkState.ACTIVE) vm.edit { it.copy(syncToCalendar = false) }
            vm.save()
        },
        onDelete = vm::requestDelete,
        onConfirmDelete = vm::confirmDelete,
        onScope = vm::onScope,
        onDismissDialogs = vm::dismissDialogs,
        onBack = onBack,
    )
}

@Composable
private fun NoHousehold(onOpenWeb: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.no_household_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Text(stringResource(R.string.no_household_body), style = MaterialTheme.typography.bodyLarge)
        Button(onClick = onOpenWeb) { Text(stringResource(R.string.open_website)) }
    }
}

private fun notificationsGranted(context: Context): Boolean =
    Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
