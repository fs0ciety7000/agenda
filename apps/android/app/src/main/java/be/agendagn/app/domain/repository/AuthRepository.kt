package be.agendagn.app.domain.repository

import be.agendagn.app.domain.model.User
import kotlinx.coroutines.flow.Flow

/** Erreurs d'authentification traduites en messages par l'UI (jamais de texte technique). */
enum class AuthError { INVALID_CREDENTIALS, RATE_LIMITED, NETWORK, UNKNOWN }

sealed interface AuthResult {
    data class Success(val user: User) : AuthResult
    data class Failure(val error: AuthError) : AuthResult
}

interface AuthRepository {
    val isSignedIn: Flow<Boolean>
    suspend fun login(email: String, password: String): AuthResult
    suspend fun currentUser(): User?
    suspend fun logout()
}
