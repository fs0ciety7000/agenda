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
    /** Double authentification : défi en cours, code à saisir. */
    val twoFactorChallenge: String? = null,
    val twoFactorCode: String = "",
) {
    val canSubmitCode: Boolean get() = twoFactorCode.isNotBlank() && !isSubmitting
    val canSubmit: Boolean get() = email.isNotBlank() && password.isNotEmpty() && !isSubmitting
}

class LoginViewModel(private val auth: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            auth.refreshProviders()
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
    fun onGoogleCallback(code: String?, error: String?) = run { auth.completeGoogleSignIn(code, error) }

    /** Connexion par passkey ; fenêtre fermée par l'utilisateur : aucun message. */
    fun signInWithPasskey(sign: suspend (optionsJson: String) -> PasskeyOutcome) {
        if (_state.value.isSubmitting) return
        run { auth.loginWithPasskey(sign) }
    }

    fun onEmailChange(value: String) = _state.update { it.copy(email = value, error = null) }
    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, error = null) }
    fun onTwoFactorCodeChange(value: String) = _state.update { it.copy(twoFactorCode = value, error = null) }

    fun submit() {
        val current = _state.value
        if (!current.canSubmit) return
        run { auth.login(current.email, current.password) }
    }

    /** Deuxième étape : code de l'application d'authentification ou code de secours. */
    fun submitTwoFactor() {
        val current = _state.value
        val challenge = current.twoFactorChallenge ?: return
        if (!current.canSubmitCode) return
        run { auth.completeTwoFactor(challenge, current.twoFactorCode) }
    }

    /** Retour au formulaire (défi expiré, mauvais compte…). */
    fun restartSignIn() = _state.update { it.copy(twoFactorChallenge = null, twoFactorCode = "", error = null) }

    private fun run(block: suspend () -> AuthResult) {
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (val result = block()) {
                is AuthResult.Success -> _state.update { it.copy(isSubmitting = false, signedIn = true) }
                is AuthResult.TwoFactorRequired -> _state.update {
                    it.copy(isSubmitting = false, twoFactorChallenge = result.challengeId, twoFactorCode = "")
                }
                is AuthResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, error = result.error.takeUnless { e -> e == AuthError.PASSKEY_CANCELLED })
                }
            }
        }
    }
}
