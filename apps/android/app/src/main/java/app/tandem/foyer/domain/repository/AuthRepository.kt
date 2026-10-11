package app.tandem.foyer.domain.repository

import app.tandem.foyer.domain.model.User
import kotlinx.coroutines.flow.Flow

/** Erreurs d'authentification traduites en messages par l'UI (jamais de texte technique). */
enum class AuthError {
    INVALID_CREDENTIALS, RATE_LIMITED, NETWORK, UNKNOWN,
    GOOGLE_FAILED, GOOGLE_EMAIL_EXISTS, REGISTRATION_CLOSED, ACCOUNT_DISABLED,
    /** Passkey refusée par le serveur ou par le téléphone. */
    PASSKEY_FAILED,
    /** Aucune passkey Tandem sur le téléphone. */
    NO_PASSKEY,
    /** Fenêtre de passkey fermée par l'utilisateur : rien à afficher. */
    PASSKEY_CANCELLED,
}

/** Résultat d'une demande au gestionnaire de passkeys du téléphone. */
sealed interface PasskeyOutcome {
    /** Réponse WebAuthn (JSON) à renvoyer au serveur. */
    data class Done(val responseJson: String) : PasskeyOutcome
    data object Cancelled : PasskeyOutcome
    data object NoPasskey : PasskeyOutcome
    /** Création : le téléphone a déjà une passkey de ce compte. */
    data object AlreadyExists : PasskeyOutcome
    data object Failed : PasskeyOutcome
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

    /** Passkeys dans l'app proposées par le serveur ? (false hors ligne). */
    suspend fun passkeysAvailable(): Boolean = false

    /**
     * Connexion par passkey : demande un défi au serveur, le passe à [sign] (gestionnaire de
     * passkeys du téléphone), puis échange la réponse contre une session.
     */
    suspend fun loginWithPasskey(sign: suspend (optionsJson: String) -> PasskeyOutcome): AuthResult =
        AuthResult.Failure(AuthError.PASSKEY_FAILED)

    /** Langue du compte (« fr » ou « en ») : e-mails et site. Sans effet hors ligne. */
    suspend fun setLanguage(locale: String) {}
}
