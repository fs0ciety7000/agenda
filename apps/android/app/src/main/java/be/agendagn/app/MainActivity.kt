package be.agendagn.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import be.agendagn.app.ui.navigation.AppNavHost
import be.agendagn.app.ui.theme.AgendaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as AgendaApplication).container
        setContent {
            AgendaTheme {
                AppNavHost(authRepository = container.authRepository)
            }
        }
    }
}
