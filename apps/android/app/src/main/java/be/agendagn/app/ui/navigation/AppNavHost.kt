package be.agendagn.app.ui.navigation

import androidx.compose.material3.Surface
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import be.agendagn.app.domain.repository.AuthRepository
import be.agendagn.app.ui.login.LoginScreen
import be.agendagn.app.ui.login.LoginViewModel
import be.agendagn.app.ui.today.TodayScreen

/**
 * Racine de navigation : l'état de session décide de l'écran.
 * Navigation Compose (onglets Aujourd'hui / Tâches / Calendrier / Réglages) arrive en Phase 5.
 */
@Composable
fun AppNavHost(authRepository: AuthRepository) {
    val signedIn by authRepository.isSignedIn.collectAsStateWithLifecycle(initialValue = null)
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when (signedIn) {
            null -> Unit
            false -> {
                val vm: LoginViewModel = viewModel(factory = viewModelFactory { initializer { LoginViewModel(authRepository) } })
                LoginScreen(viewModel = vm, onSignedIn = {})
            }
            true -> TodayScreen(authRepository)
        }
    }
}
