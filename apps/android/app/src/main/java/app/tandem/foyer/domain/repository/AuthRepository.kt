package app.tandem.foyer.domain.repository

import app.tandem.foyer.domain.model.User
import kotlinx.coroutines.flow.Flow

/** Erreurs d'authentification traduites en messages par l'UI (jamais de texte technique). */
enum class AuthError {
    INVALID_CREDENTIALS, RATE_LIMITED, NETWORK, UNKNOWN,
    GOOGLE_FAILED, GOOGLE_EMAIL_EXISTS, REGISTRATION_CLOSED, ACCOUNT_DISABLED,
}

sealed interface AuthResult {
    data class Success(val user: User) : AuthResult
    data class Failure(val error: AuthError) : AuthResult
}

interface AuthRepository {
    val isSignedIn: Flow<Boolean>
    suspend fun login(email: String, password: String): AuthResult

    /** « Continuer avec Google » proposé par le serveur ? (false hors ligne). */
    suspend fun googleAvailable(): Boolean

    /** Adresse à ouvrir dans un Custom Tab ; le verifier PKCE reste sur le téléphone. */
    suspend fun googleSignInUrl(webBaseUrl: String): String

    /** Retour `app.tandem.foyer://auth?code=…|error=…` : échange le code contre une session. */
    suspend fun completeGoogleSignIn(code: String?, error: String?): AuthResult
    suspend fun currentUser(): User?
    suspend fun logout()

    /** Langue du compte (« fr » ou « en ») : e-mails et site. Sans effet hors ligne. */
    suspend fun setLanguage(locale: String) {}
}
