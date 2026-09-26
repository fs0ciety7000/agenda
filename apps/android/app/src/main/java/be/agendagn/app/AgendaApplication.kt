package be.agendagn.app

import android.app.Application
import be.agendagn.app.di.AppContainer
import be.agendagn.app.widget.ShoppingWidget
import be.agendagn.app.widget.TodayWidget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class AgendaApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.crashReporter.install()
        container.reminders.start()
        container.syncScheduler.schedulePeriodic()
        // Widget « Aujourd'hui » : redessiné à chaque changement du cache local.
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            TodayWidget.keepUpdated(this@AgendaApplication, container.repository)
        }
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            ShoppingWidget.keepUpdated(this@AgendaApplication, container.repository)
        }
    }
}
