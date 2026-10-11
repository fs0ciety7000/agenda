package app.tandem.foyer.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.tandem.foyer.domain.repository.AuthError
import app.tandem.foyer.domain.repository.AuthRepository
import app.tandem.foyer.domain.repository.AuthResult
import app.tandem.foyer.domain.repository.PasskeyOutcome
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
    /** Passkeys dans l'app proposées par le serveur. */
    val passkeysAvailable: Boolean = false,
) {
    val canSubmit: Boolean get() = email.isNotBlank() && password.isNotEmpty() && !isSubmitting
}

class LoginViewModel(private val auth: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val google = auth.googleAvailable()
            val passkeys = auth.passkeysAvailable()
            _state.update { it.copy(googleAvailable = google, passkeysAvailable = passkeys) }
        }
    }

    /** Adresse de la page Google à ouvrir (Custom Tab). */
    suspend fun googleUrl(webBaseUrl: String): String {
        _state.update { it.copy(error = null) }
        return auth.googleSignInUrl(webBaseUrl)
    }

    /** Retour de Google dans l'app (`app.tandem.foyer://auth?code=…`). */
    fun onGoogleCallback(code: String?, error: String?) {
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (val result = auth.completeGoogleSignIn(code, error)) {
                is AuthResult.Success -> _state.update { it.copy(isSubmitting = false, signedIn = true) }
                is AuthResult.Failure -> _state.update { it.copy(isSubmitting = false, error = result.error) }
            }
        }
    }

    /** Connexion par passkey ; fenêtre fermée par l'utilisateur : aucun message. */
    fun signInWithPasskey(sign: suspend (optionsJson: String) -> PasskeyOutcome) {
        if (_state.value.isSubmitting) return
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (val result = auth.loginWithPasskey(sign)) {
                is AuthResult.Success -> _state.update { it.copy(isSubmitting = false, signedIn = true) }
                is AuthResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, error = result.error.takeUnless { e -> e == AuthError.PASSKEY_CANCELLED })
                }
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
