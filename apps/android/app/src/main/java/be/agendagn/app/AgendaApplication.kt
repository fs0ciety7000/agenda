package be.agendagn.app

import android.app.Application
import be.agendagn.app.di.AppContainer

class AgendaApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.crashReporter.install()
        container.reminders.start()
        container.syncScheduler.schedulePeriodic()
    }
}
