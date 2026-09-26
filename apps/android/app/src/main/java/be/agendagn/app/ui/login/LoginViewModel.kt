package be.agendagn.app.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.agendagn.app.domain.repository.AuthError
import be.agendagn.app.domain.repository.AuthRepository
import be.agendagn.app.domain.repository.AuthResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isSubmitting: Boolean = false,
    val error: AuthError? = null,
    val signedIn: Boolean = false,
    val googleAvailable: Boolean = false,
) {
    val canSubmit: Boolean get() = email.isNotBlank() && password.isNotEmpty() && !isSubmitting
}

class LoginViewModel(private val auth: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val available = auth.googleAvailable()
            _state.update { it.copy(googleAvailable = available) }
        }
    }

    /** Adresse de la page Google à ouvrir (Custom Tab). */
    suspend fun googleUrl(webBaseUrl: String): String {
        _state.update { it.copy(error = null) }
        return auth.googleSignInUrl(webBaseUrl)
    }

    /** Retour de Google dans l'app (`be.agendagn.app://auth?code=…`). */
    fun onGoogleCallback(code: String?, error: String?) {
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (val result = auth.completeGoogleSignIn(code, error)) {
                is AuthResult.Success -> _state.update { it.copy(isSubmitting = false, signedIn = true) }
                is AuthResult.Failure -> _state.update { it.copy(isSubmitting = false, error = result.error) }
            }
        }
    }

    fun onEmailChange(value: String) = _state.update { it.copy(email = value, error = null) }
    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, error = null) }

    fun submit() {
        val current = _state.value
        if (!current.canSubmit) return
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (val result = auth.login(current.email, current.password)) {
                is AuthResult.Success -> _state.update { it.copy(isSubmitting = false, signedIn = true) }
                is AuthResult.Failure -> _state.update { it.copy(isSubmitting = false, error = result.error) }
            }
        }
    }
}
