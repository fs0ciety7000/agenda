package app.tandem.foyer

import android.app.Application
import app.tandem.foyer.di.AppContainer
import app.tandem.foyer.widget.ShoppingWidget
import app.tandem.foyer.widget.TodayWidget
import app.tandem.foyer.widget.WeekWidget
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
        container.recap.start()
        container.review.start()
        container.syncScheduler.schedulePeriodic()
        // Widget « Aujourd'hui » : redessiné à chaque changement du cache local.
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            TodayWidget.keepUpdated(this@AgendaApplication, container.repository)
        }
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            WeekWidget.keepUpdated(this@AgendaApplication, container.repository)
        }
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            ShoppingWidget.keepUpdated(this@AgendaApplication, container.repository)
        }
    }
}
