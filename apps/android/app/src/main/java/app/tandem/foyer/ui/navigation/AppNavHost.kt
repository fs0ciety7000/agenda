package app.tandem.foyer.ui.navigation

import android.app.Activity
import android.content.ContextWrapper
import android.content.res.Resources
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import app.tandem.foyer.data.AppLanguage
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import app.tandem.foyer.data.files.AttachmentFiles
import android.provider.OpenableColumns
import app.tandem.foyer.domain.model.Attachment
import androidx.core.content.FileProvider
import java.util.Locale
import android.speech.RecognizerIntent
import android.content.Intent
import android.content.ActivityNotFoundException
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.tandem.foyer.ui.absences.AbsencesScreen
import app.tandem.foyer.ui.report.ReportScreen
import app.tandem.foyer.ui.report.ReportViewModel
import app.tandem.foyer.ui.comments.CommentsSection
import app.tandem.foyer.ui.absences.AbsencesViewModel
import app.tandem.foyer.ui.expenses.ExpensesScreen
import app.tandem.foyer.ui.expenses.ExpensesViewModel
import app.tandem.foyer.ui.dates.DatesScreen
import app.tandem.foyer.ui.dates.DatesViewModel
import app.tandem.foyer.ui.dates.UpcomingDates
import app.tandem.foyer.ui.notes.NotesScreen
import app.tandem.foyer.ui.notes.NotesViewModel
import app.tandem.foyer.ui.history.HistoryScreen
import app.tandem.foyer.ui.history.HistoryViewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.tandem.foyer.BuildConfig
import app.tandem.foyer.R
import app.tandem.foyer.data.ReminderSettings
import app.tandem.foyer.di.AppContainer
import app.tandem.foyer.domain.Agenda
import app.tandem.foyer.domain.model.CalendarLinkState
import app.tandem.foyer.domain.model.CalendarStatus
import app.tandem.foyer.domain.model.User
import app.tandem.foyer.ui.calendar.CalendarScreen
import app.tandem.foyer.ui.components.UpdateBanner
import app.tandem.foyer.ui.login.LoginScreen
import app.tandem.foyer.ui.login.LoginViewModel
import app.tandem.foyer.ui.main.AgendaEvent
import app.tandem.foyer.ui.main.AgendaViewModel
import app.tandem.foyer.domain.repository.OpResult
import app.tandem.foyer.ui.components.currentLocale
import app.tandem.foyer.ui.components.formatLongDate
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import app.tandem.foyer.ui.quickadd.QuickAddSheet
import app.tandem.foyer.ui.share.ShareSheet
import app.tandem.foyer.ui.share.SharedText
import app.tandem.foyer.ui.share.noteFromShare
import app.tandem.foyer.ui.shopping.splitShoppingItems
import app.tandem.foyer.ui.search.SearchScreen
import app.tandem.foyer.ui.search.SearchTarget
import app.tandem.foyer.ui.settings.DeviceSessions
import app.tandem.foyer.ui.settings.SettingsScreen
import app.tandem.foyer.ui.shopping.GuestLinkButton
import app.tandem.foyer.ui.shopping.ShoppingScreen
import app.tandem.foyer.ui.swaps.SwapAsk
import app.tandem.foyer.ui.swaps.SwapBanner
import app.tandem.foyer.data.remote.RealtimeClient
import androidx.lifecycle.repeatOnLifecycle
import app.tandem.foyer.ui.taskform.TaskFormScreen
import app.tandem.foyer.ui.taskform.TaskFormViewModel
import app.tandem.foyer.ui.tasks.TasksScreen
import app.tandem.foyer.ui.today.TodayScreen
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

/** Racine : l'état de session décide de l'écran (connexion ou application). */
@Composable
fun AppNavHost(
    container: AppContainer,
    openOccurrenceId: String? = null,
    quickAddRequest: Int = 0,
    quickAddText: String? = null,
    voiceRequest: Int = 0,
    shared: SharedText? = null,
    tabRequest: Pair<String, Int>? = null,
    googleCallback: Uri? = null,
    onGoogleCallbackHandled: () -> Unit = {},
) {
    val signedIn by container.authRepository.isSignedIn.collectAsStateWithLifecycle(initialValue = null)
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when (signedIn) {
            null -> Unit
            false -> {
                val vm: LoginViewModel = viewModel(factory = viewModelFactory { initializer { LoginViewModel(container.authRepository) } })
                val context = LocalContext.current
                val scope = rememberCoroutineScope()
                LaunchedEffect(googleCallback) {
                    googleCallback?.let {
                        vm.onGoogleCallback(it.getQueryParameter("code"), it.getQueryParameter("error"))
                        onGoogleCallbackHandled()
                    }
                }
                LoginScreen(
                    viewModel = vm,
                    onSignedIn = {},
                    onOpenWeb = { path -> openWeb(context, container.webBaseUrl, path) },
                    onGoogle = { scope.launch { openWeb(context, vm.googleUrl(container.webBaseUrl), "") } },
                )
            }
            true -> MainScaffold(container, openOccurrenceId, quickAddRequest, tabRequest, quickAddText, voiceRequest, shared)
        }
    }
}

fun openWeb(context: Context, base: String, path: String) {
    CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(base + path))
}

@Composable
private fun MainScaffold(
    container: AppContainer,
    openOccurrenceId: String?,
    quickAddRequest: Int,
    tabRequest: Pair<String, Int>? = null,
    quickAddText: String? = null,
    voiceRequest: Int = 0,
    shared: SharedText? = null,
) {
    val context = LocalContext.current
    val vm: AgendaViewModel = viewModel(
        factory = viewModelFactory { initializer { AgendaViewModel(container.repository, container.online) } },
    )
    val state by vm.state.collectAsStateWithLifecycle()
    val quickAdd by vm.quickAdd.collectAsStateWithLifecycle()
    val reminders by container.settings.reminders.collectAsStateWithLifecycle(initialValue = ReminderSettings())
    val morningRecap by container.settings.morningRecap.collectAsStateWithLifecycle(initialValue = true)
    val weeklyReview by container.settings.weeklyReview.collectAsStateWithLifecycle(initialValue = true)
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val scope = rememberCoroutineScope()

    var showQuickAdd by rememberSaveable { mutableStateOf(false) }
    var templates by remember { mutableStateOf<List<app.tandem.foyer.domain.model.TaskTemplate>?>(null) }
    LaunchedEffect(showQuickAdd) { if (showQuickAdd) templates = container.repository.templates() ?: templates }
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
        // Notifications instantanées : ce téléphone est rattaché au compte connecté.
        launch { container.push.register() }
        user = container.authRepository.currentUser()
        // Rappels activés par défaut : on demande l'autorisation une fois, dans le contexte.
        if (!notificationsAllowed && Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
    LaunchedEffect(openOccurrenceId) { openOccurrenceId?.let { nav.navigate("task/$it") } }
    LaunchedEffect(quickAddRequest) {
        if (quickAddRequest > 0) {
            quickAddText?.let(vm::onQuickAddText)
            showQuickAdd = true
        }
    }
    val snackbar = remember { SnackbarHostState() }
    // Dictée : la reconnaissance vocale d'Android remplit l'ajout rapide (analysé comme au clavier).
    val voiceUnavailable = stringResource(R.string.voice_unavailable)
    val voicePrompt = stringResource(R.string.voice_prompt)
    val voice = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let {
            vm.onQuickAddText(it)
            showQuickAdd = true
        }
    }
    val startVoice: () -> Unit = {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
            .putExtra(RecognizerIntent.EXTRA_PROMPT, voicePrompt)
        try {
            voice.launch(intent)
        } catch (_: ActivityNotFoundException) {
            scope.launch { snackbar.showSnackbar(voiceUnavailable) }
        }
    }
    LaunchedEffect(voiceRequest) { if (voiceRequest > 0) startVoice() }
    LaunchedEffect(tabRequest) {
        val tab = Tab.entries.firstOrNull { it.route == tabRequest?.first } ?: return@LaunchedEffect
        nav.navigate(tab.route) {
            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
        }
    }

    // Temps réel tant que l'app est à l'écran : l'autre coche, ajoute, attribue → visible aussitôt.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var live by remember { mutableStateOf(false) }
    var shoppingRefreshing by remember { mutableStateOf(false) }
    val shopping by container.repository.shopping.collectAsStateWithLifecycle(initialValue = emptyList())
    LaunchedEffect(state.household?.id) {
        val hid = state.household?.id ?: return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            try {
                container.realtime.topics(hid).collect { topic ->
                    when (topic) {
                        RealtimeClient.CONNECTED -> {
                            live = true
                            // Ce qui a changé avant (ou pendant une coupure) n'a pas été signalé.
                            launch { container.repository.refreshShopping() }
                            launch { container.repository.refresh() }
                        }
                        "shopping" -> launch { container.repository.refreshShopping() }
                        "tasks" -> launch { container.repository.refresh() }
                        "notifications" -> launch { container.activityNotifier.poll(hid) }
                        "comments" -> container.comments.changed()
                        "notes" -> container.notes.changed()
                        "dates" -> container.dates.changed()
                    }
                }
            } finally {
                live = false
            }
        }
    }

    // Mise à jour de l'app : vérifiée au lancement et au retour dans l'app (ex. après avoir
    // autorisé l'installation dans les réglages Android).
    val updater = container.updater
    val update by updater.available.collectAsStateWithLifecycle()
    val pushState by container.push.state.collectAsStateWithLifecycle()
    val updateState by updater.state.collectAsStateWithLifecycle()
    var canInstall by remember { mutableStateOf(updater.canInstall()) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        canInstall = updater.canInstall()
        scope.launch { updater.check() }
        state.household?.id?.let { hid -> scope.launch { container.activityNotifier.poll(hid) } }
    }
    val onUpdate: () -> Unit = {
        val manifest = update
        when {
            manifest == null -> Unit
            !updater.canInstall() -> context.startActivity(updater.permissionIntent())
            else -> scope.launch { updater.download(manifest)?.let(context::startActivity) }
        }
    }
    val updateBanner: @Composable () -> Unit = {
        update?.let { UpdateBanner(it, updateState, canInstall, onUpdate) }
    }

    // Messages du glisser-déposer (avec « Annuler »).
    val locale = currentLocale()
    val undoLabel = stringResource(R.string.undo)
    val movedFormat = stringResource(R.string.task_moved)
    val moveErrors = mapOf(
        OpResult.Offline to stringResource(R.string.error_offline_edit),
        OpResult.Conflict to stringResource(R.string.error_conflict),
        OpResult.NotFound to stringResource(R.string.error_not_found),
    )
    val genericError = stringResource(R.string.error_generic)
    val thanksFailed = stringResource(R.string.thanks_failed)
    val completedFormat = stringResource(R.string.task_completed_snack)
    val deletedMessage = stringResource(R.string.task_deleted)
    val restoredMessage = stringResource(R.string.task_restored)
    val restoreFailed = stringResource(R.string.task_restore_failed)
    // Suppression depuis la fiche : « Annuler » restaure la tâche (corbeille, 30 jours).
    val onDeleted: (String) -> Unit = { id ->
        scope.launch {
            val result = snackbar.showSnackbar(deletedMessage, actionLabel = undoLabel, duration = SnackbarDuration.Short)
            if (result == SnackbarResult.ActionPerformed) {
                val restored = container.repository.restore(id)
                snackbar.showSnackbar(
                    when (restored) {
                        OpResult.Ok -> restoredMessage
                        OpResult.Offline -> moveErrors.getValue(OpResult.Offline)
                        else -> restoreFailed
                    },
                )
            }
        }
    }
    val attachmentError = stringResource(R.string.attachment_error)
    val attachmentNoApp = stringResource(R.string.attachment_no_app)
    val onMessage: (String) -> Unit = { message -> scope.launch { snackbar.showSnackbar(message) } }
    val clearedLabel = stringResource(R.string.shopping_cleared)
    val noteExpenseLabel = stringResource(R.string.shopping_note_expense)
    val shoppingTitle = stringResource(R.string.shopping_title)
    // Pièce jointe : téléchargée puis ouverte par l'app adaptée (lecteur PDF, galerie…).
    val onOpenAttachment: (Attachment) -> Unit = { a ->
        scope.launch {
            val file = container.attachments.download(a)
            if (file == null) {
                snackbar.showSnackbar(attachmentError)
                return@launch
            }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.attachments", file)
            val intent = Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, a.contentType)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            try {
                context.startActivity(intent)
            } catch (_: ActivityNotFoundException) {
                snackbar.showSnackbar(attachmentNoApp)
            }
        }
    }
    LaunchedEffect(vm) {
        vm.events.collect { event ->
            when (event) {
                is AgendaEvent.Moved -> scope.launch {
                    val result = snackbar.showSnackbar(
                        movedFormat.format(event.title, formatLongDate(event.to, locale)),
                        actionLabel = undoLabel,
                        duration = SnackbarDuration.Short,
                    )
                    if (result == SnackbarResult.ActionPerformed) {
                        vm.state.value.occurrences.firstOrNull { it.id == event.occurrenceId }
                            ?.let { vm.move(it, event.from, undo = true) }
                    }
                }
                is AgendaEvent.MoveFailed -> scope.launch { snackbar.showSnackbar(moveErrors[event.result] ?: genericError) }
                is AgendaEvent.ThanksFailed -> scope.launch { snackbar.showSnackbar(thanksFailed) }
                is AgendaEvent.Completed -> scope.launch {
                    val result = snackbar.showSnackbar(
                        completedFormat.format(event.title),
                        actionLabel = undoLabel,
                        duration = SnackbarDuration.Short,
                    )
                    if (result == SnackbarResult.ActionPerformed) {
                        vm.state.value.occurrences.firstOrNull { it.id == event.occurrenceId && it.isDone }
                            ?.let { vm.toggle(it, undo = true) }
                    }
                }
            }
        }
    }

    // Partage depuis une autre app : on demande ce que le texte doit devenir.
    var pendingShare by remember { mutableStateOf<SharedText?>(null) }
    LaunchedEffect(shared?.id) { if (shared != null) pendingShare = shared }
    val noteAddedFmt = stringResource(R.string.share_note_added)
    val noteOffline = stringResource(R.string.share_note_offline)
    pendingShare?.let { s ->
        val items = remember(s) { splitShoppingItems(s.text) }
        val shoppingAdded = pluralStringResource(R.plurals.share_shopping_added, items.size, items.size)
        ShareSheet(
            text = s.text,
            onTask = {
                pendingShare = null
                vm.onQuickAddText(s.text.take(500))
                showQuickAdd = true
            },
            onNote = {
                pendingShare = null
                val (title, body) = noteFromShare(s.text, s.subject)
                scope.launch {
                    val ok = container.notes.create(title, body, pinned = false)
                    snackbar.showSnackbar(if (ok) noteAddedFmt.format(title) else noteOffline)
                }
            },
            onShopping = {
                pendingShare = null
                scope.launch {
                    container.repository.addShopping(items)
                    snackbar.showSnackbar(shoppingAdded)
                }
            },
            onDismiss = { pendingShare = null },
        )
    }

    val tabs = Tab.entries
    val onTab = route in tabs.map { it.route }
    var showDrawer by rememberSaveable { mutableStateOf(false) }
    if (showDrawer) {
        NavDrawer(
            destinations = drawerDestinations(withAbsences = (state.household?.members?.size ?: 0) > 1),
            current = route,
            onOpen = { target ->
                showDrawer = false
                if (target == Tab.SETTINGS.route) {
                    nav.navigate(target) {
                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                } else {
                    nav.navigate(target) { launchSingleTop = true }
                }
            },
            onDismiss = { showDrawer = false },
        )
    }
    val open = { id: String -> nav.navigate("task/$id") }

    if (state.loaded && state.household == null) {
        NoHousehold { openWeb(context, container.webBaseUrl, "onboarding") }
        return
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (onTab) {
                BottomBar(
                    current = route,
                    onTab = { tab ->
                        nav.navigate(tab.route) {
                            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    onMore = { showDrawer = true },
                )
            }
        },
        floatingActionButton = {
            if (onTab && route != Tab.SETTINGS.route && route != Tab.SHOPPING.route) {
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
                    onThank = vm::thank,
                    onSearch = { nav.navigate("search") },
                    banner = {
                        updateBanner()
                        SwapBanner(container.swaps, state.household?.members.orEmpty(), state.occurrences, vm::refresh, onMessage)
                        UpcomingDates(container.dates, state.occurrences) { nav.navigate("dates") }
                    },
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
            composable(Tab.SHOPPING.route) {
                // Suggestions recalculées quand la liste change (ajout, coche, panier vidé).
                var shoppingSuggestions by remember { mutableStateOf(emptyList<String>()) }
                LaunchedEffect(shopping.map { it.id to it.done }) {
                    shoppingSuggestions = container.repository.shoppingSuggestions()
                }
                var meals by remember { mutableStateOf<List<app.tandem.foyer.domain.model.Meal>?>(null) }
                LaunchedEffect(state.online, state.today) { meals = container.repository.weekMeals(state.today) }
                ShoppingScreen(
                    items = shopping,
                    members = state.members,
                    online = state.online,
                    live = live,
                    sync = state.sync,
                    refreshing = shoppingRefreshing,
                    onRefresh = {
                        scope.launch {
                            shoppingRefreshing = true
                            container.repository.refreshShopping()
                            shoppingRefreshing = false
                        }
                    },
                    onAdd = { scope.launch { container.repository.addShopping(it) } },
                    onToggle = { scope.launch { container.repository.setShoppingDone(it, !it.done) } },
                    onRemove = { scope.launch { container.repository.removeShopping(it) } },
                    onClearDone = {
                        scope.launch {
                            container.repository.clearShoppingDone()
                            // Retour du magasin : proposer de noter ce qui a été payé.
                            val result = snackbar.showSnackbar(
                                clearedLabel,
                                actionLabel = noteExpenseLabel,
                                duration = SnackbarDuration.Long,
                            )
                            if (result == SnackbarResult.ActionPerformed) {
                                nav.navigate("expenses?title=${Uri.encode(shoppingTitle)}&category=GROCERIES")
                            }
                        }
                    },
                    contentPadding = padding,
                    suggestions = shoppingSuggestions,
                    onAisle = { item, aisle -> scope.launch { container.repository.setShoppingAisle(item, aisle) } },
                    meals = meals,
                    onMealsToShopping = { list ->
                        scope.launch {
                            val result = container.repository.mealsToShopping(list.map { it.id })
                            snackbar.showSnackbar(result?.let { context.resources.getQuantityString(R.plurals.meals_added, it.first, it.first) } ?: genericError)
                            meals = container.repository.weekMeals(state.today)
                        }
                    },
                    onOpenMeals = { openWeb(context, container.webBaseUrl, "meals") },
                    guestLink = {
                        GuestLinkButton(
                            online = state.online,
                            householdName = state.household?.name.orEmpty(),
                            members = state.members,
                            load = container.guestLink::get,
                            create = container.guestLink::create,
                            revoke = container.guestLink::revoke,
                            onMessage = onMessage,
                        )
                    },
                )
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
                    onMove = { o, day -> vm.move(o, day) },
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
                    onSignOut = {
                        scope.launch {
                            container.push.unregister()
                            container.authRepository.logout()
                        }
                    },
                    contentPadding = padding,
                    update = updateBanner,
                    push = pushState,
                    morningRecap = morningRecap,
                    onMorningRecap = { scope.launch { container.settings.setMorningRecap(it) } },
                    weeklyReview = weeklyReview,
                    onWeeklyReview = { scope.launch { container.settings.setWeeklyReview(it) } },
                    onRetryPush = { scope.launch { container.push.register() } },
                    language = remember { AppLanguage.current(context) },
                    onLanguage = { tag ->
                        val activity = context.findActivity() ?: return@SettingsScreen
                        // Langue du compte (e-mails) : hors de l'écran, recréé par le changement de langue.
                        val account = tag.ifEmpty {
                            AppLanguage.supportedOrEnglish(Resources.getSystem().configuration.locales[0].language)
                        }
                        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                            container.authRepository.setLanguage(account)
                        }
                        AppLanguage.set(activity, tag)
                    },
                    devices = { DeviceSessions(container.devices, onMessage) },
                )
            }
            composable("report") {
                val online = state.online
                val reportVm: ReportViewModel = viewModel(
                    factory = viewModelFactory { initializer { ReportViewModel(container.reports) { online } } },
                )
                ReportScreen(
                    reportVm,
                    faqUrl = stringResource(R.string.report_faq_url),
                    onBack = { nav.popBackStack() },
                    onMessage = onMessage,
                )
            }
            composable("absences") {
                val absencesVm: AbsencesViewModel = viewModel(factory = viewModelFactory { initializer { AbsencesViewModel(container.absences) } })
                val members = state.household?.members.orEmpty()
                AbsencesScreen(
                    absencesVm,
                    members,
                    members.firstOrNull { it.userId != null && it.userId == user?.id }?.id,
                    onBack = { nav.popBackStack() },
                    onMessage = onMessage,
                )
            }
            composable(
                "expenses?title={title}&category={category}&month={month}",
                arguments = listOf(
                    navArgument("title") { type = NavType.StringType; nullable = true },
                    navArgument("category") { type = NavType.StringType; nullable = true },
                    // Mois à ouvrir (AAAA-MM), par exemple depuis la recherche.
                    navArgument("month") { type = NavType.StringType; nullable = true },
                ),
            ) { entry ->
                val month = entry.arguments?.getString("month")
                    ?.let { runCatching { java.time.YearMonth.parse(it) }.getOrNull() } ?: java.time.YearMonth.now()
                val expensesVm: ExpensesViewModel = viewModel(factory = viewModelFactory { initializer { ExpensesViewModel(container.expenses, month) } })
                val members = state.household?.members.orEmpty()
                ExpensesScreen(
                    expensesVm,
                    members,
                    members.firstOrNull { it.userId != null && it.userId == user?.id }?.id,
                    onBack = { nav.popBackStack() },
                    onMessage = onMessage,
                    prefillTitle = entry.arguments?.getString("title"),
                    prefillCategory = entry.arguments?.getString("category"),
                )
            }
            composable("dates") {
                val datesVm: DatesViewModel = viewModel(factory = viewModelFactory { initializer { DatesViewModel(container.dates) } })
                DatesScreen(datesVm, onBack = { nav.popBackStack() }, onMessage = onMessage)
            }
            composable("search") {
                SearchScreen(container.search, onBack = { nav.popBackStack() }) { target ->
                    when (target) {
                        is SearchTarget.Task -> nav.navigate("task/${target.occurrenceId}")
                        is SearchTarget.Page -> if (target.route == Tab.SHOPPING.route) {
                            nav.navigate(target.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                            }
                        } else {
                            nav.navigate(target.route)
                        }
                    }
                }
            }
            composable("notes") {
                val notesVm: NotesViewModel = viewModel(factory = viewModelFactory { initializer { NotesViewModel(container.notes) } })
                NotesScreen(
                    notesVm,
                    state.household?.members.orEmpty(),
                    onBack = { nav.popBackStack() },
                    onMessage = onMessage,
                    onUndoable = { message, undo ->
                        scope.launch {
                            val result = snackbar.showSnackbar(message, actionLabel = undoLabel, duration = SnackbarDuration.Short)
                            if (result == SnackbarResult.ActionPerformed) undo()
                        }
                    },
                )
            }
            composable("history") {
                val historyVm: HistoryViewModel = viewModel(factory = viewModelFactory { initializer { HistoryViewModel(container.activity) } })
                HistoryScreen(historyVm, state.household?.members.orEmpty(), onBack = { nav.popBackStack() }, onMessage = onMessage)
            }
            composable("task/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                val id = entry.arguments?.getString("id")
                TaskForm(container, id, null, state, calendar, onDeleted, onOpenAttachment, onMessage) { nav.popBackStack() }
            }
            composable("new?date={date}", arguments = listOf(navArgument("date") { type = NavType.StringType; nullable = true })) { entry ->
                val date = entry.arguments?.getString("date")?.let(LocalDate::parse)
                TaskForm(container, null, date, state, calendar, onDeleted, onOpenAttachment, onMessage) { nav.popBackStack() }
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
            templates = templates,
            onVoice = {
                showQuickAdd = false
                startVoice()
            },
            onApplyTemplate = { template, date ->
                showQuickAdd = false
                scope.launch {
                    val result = container.repository.applyTemplate(template, date)
                    snackbar.showSnackbar(
                        if (result == OpResult.Ok) {
                            context.resources.getQuantityString(R.plurals.templates_applied, template.titles.size, template.titles.size, template.name)
                        } else {
                            moveErrors[result] ?: genericError
                        },
                    )
                }
            },
        )
    }
}

@Composable
private fun TaskForm(
    container: AppContainer,
    occurrenceId: String?,
    date: LocalDate?,
    state: app.tandem.foyer.ui.main.AgendaUiState,
    calendar: CalendarStatus?,
    onDeleted: (occurrenceId: String) -> Unit,
    onOpenAttachment: (Attachment) -> Unit,
    onMessage: (String) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var uploading by remember { mutableStateOf(false) }
    val messages = mapOf(
        AttachmentFiles.UploadResult.OK to stringResource(R.string.attachment_added),
        AttachmentFiles.UploadResult.TOO_LARGE to stringResource(R.string.attachment_too_large),
        AttachmentFiles.UploadResult.OFFLINE to stringResource(R.string.attachment_offline),
        AttachmentFiles.UploadResult.FAILED to stringResource(R.string.attachment_failed),
    )
    val deleteFailed = stringResource(R.string.attachment_failed)
    // Envoi d'un fichier choisi ou d'une photo prise (lu depuis son Uri, puis envoyé à l'API).
    val upload: (Uri, String?, String?) -> Unit = { uri, name, type ->
        val id = occurrenceId
        if (id != null) {
            scope.launch {
                uploading = true
                val result = withContext(Dispatchers.IO) {
                    runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
                }?.let { bytes ->
                    container.attachments.upload(
                        id,
                        name ?: displayName(context, uri) ?: "photo.jpg",
                        type ?: context.contentResolver.getType(uri) ?: "application/octet-stream",
                        bytes,
                    )
                } ?: AttachmentFiles.UploadResult.FAILED
                uploading = false
                onMessage(messages.getValue(result))
            }
        }
    }
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    val takePhoto = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = photoUri
        if (ok && uri != null) {
            val stamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd-HHmm"))
            upload(uri, "photo-$stamp.jpg", "image/jpeg")
        }
    }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) upload(uri, null, null)
    }
    val vm: TaskFormViewModel = viewModel(
        key = "form-$occurrenceId-$date",
        factory = viewModelFactory { initializer { TaskFormViewModel(container.repository, occurrenceId, date) } },
    )
    val form by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(form.deleted) { if (form.deleted) form.original?.let { onDeleted(it.id) } }
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
        onAddItem = vm::addItem,
        onToggleItem = vm::toggleItem,
        onRemoveItem = vm::removeItem,
        onRetrySeries = vm::retrySeries,
        onPostpone = vm::postpone,
        onOpenAttachment = onOpenAttachment,
        onAddPhoto = {
            val dir = java.io.File(context.cacheDir, "camera").apply { mkdirs() }
            val file = java.io.File(dir, "photo-${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.attachments", file)
            photoUri = uri
            try {
                takePhoto.launch(uri)
            } catch (_: ActivityNotFoundException) {
                onMessage(deleteFailed)
            }
        },
        onAddFile = { pickFile.launch("*/*") },
        onDeleteAttachment = { a ->
            val id = occurrenceId
            if (id != null) {
                scope.launch { if (!container.attachments.delete(id, a)) onMessage(deleteFailed) }
            }
        },
        uploading = uploading,
        comments = {
            val o = form.original
            if (o != null && !o.isLocal) {
                SwapAsk(container.swaps, o, state.household?.members.orEmpty(), state.myMemberId, onMessage)
                CommentsSection(container.comments, o.id, state.household?.members.orEmpty(), state.myMemberId, onMessage)
            }
        },
        suggestion = state.household?.let { h ->
            Agenda.suggestAssignee(Agenda.weekBalance(state.occurrences, form.draft.date ?: state.today, h.members))
        },
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

/** Nom affiché d'un fichier choisi (sélecteur de fichiers Android). */
private fun displayName(context: Context, uri: Uri): String? =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0) else null
    }

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
