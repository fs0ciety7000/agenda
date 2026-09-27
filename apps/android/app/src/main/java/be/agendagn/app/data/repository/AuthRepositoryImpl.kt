package be.agendagn.app.data.repository

import be.agendagn.app.data.auth.PkceStore
import be.agendagn.app.data.auth.TokenStore
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.data.remote.ApiErrorDto
import be.agendagn.app.data.remote.LoginRequest
import be.agendagn.app.data.remote.MeDto
import be.agendagn.app.data.remote.MobileExchangeRequest
import be.agendagn.app.data.remote.RefreshRequest
import be.agendagn.app.data.remote.json
import be.agendagn.app.domain.model.User
import be.agendagn.app.domain.repository.AuthError
import be.agendagn.app.domain.repository.AuthRepository
import be.agendagn.app.domain.repository.AuthResult
import kotlinx.coroutines.flow.Flow
import java.io.IOException

class AuthRepositoryImpl(
    private val api: AgendaApi,
    private val tokens: TokenStore,
    /** Efface le cache local et l'outbox à la déconnexion volontaire. */
    private val clearLocalData: suspend () -> Unit = {},
    private val pkce: PkceStore? = null,
) : AuthRepository {
    override val isSignedIn: Flow<Boolean> = tokens.hasSession

    override suspend fun login(email: String, password: String): AuthResult = try {
        val response = api.login(LoginRequest(email.trim().lowercase(), password))
        val body = response.body()
        when {
            response.isSuccessful && body?.accessToken != null && body.refreshToken != null -> {
                tokens.save(body.accessToken, body.refreshToken)
                AuthResult.Success(body.user.toDomain())
            }
            else -> AuthResult.Failure(mapError(response.code(), response.errorBody()?.string()))
        }
    } catch (_: IOException) {
        AuthResult.Failure(AuthError.NETWORK)
    }

    override suspend fun googleAvailable(): Boolean = try {
        pkce != null && api.providers().body()?.google == true
    } catch (_: IOException) {
        false
    }

    override suspend fun googleSignInUrl(webBaseUrl: String): String {
        val (_, challenge) = requireNotNull(pkce).create()
        return "${webBaseUrl}v1/auth/google/start?client=android&code_challenge=$challenge"
    }

    override suspend fun completeGoogleSignIn(code: String?, error: String?): AuthResult {
        val verifier = pkce?.take()
        if (code == null || verifier == null) return AuthResult.Failure(googleError(error))
        return try {
            val response = api.googleMobileExchange(MobileExchangeRequest(code, verifier))
            val body = response.body()
            if (response.isSuccessful && body?.accessToken != null && body.refreshToken != null) {
                tokens.save(body.accessToken, body.refreshToken)
                AuthResult.Success(body.user.toDomain())
            } else {
                AuthResult.Failure(if (response.code() == 429) AuthError.RATE_LIMITED else AuthError.GOOGLE_FAILED)
            }
        } catch (_: IOException) {
            AuthResult.Failure(AuthError.NETWORK)
        }
    }

    private fun googleError(code: String?) = when (code) {
        "GOOGLE_EMAIL_EXISTS" -> AuthError.GOOGLE_EMAIL_EXISTS
        "REGISTRATION_CLOSED" -> AuthError.REGISTRATION_CLOSED
        "ACCOUNT_DISABLED" -> AuthError.ACCOUNT_DISABLED
        else -> AuthError.GOOGLE_FAILED
    }

    override suspend fun currentUser(): User? = try {
        api.me().body()?.toDomain()
    } catch (_: IOException) {
        null
    }

    override suspend fun logout() {
        val refresh = tokens.refreshToken()
        tokens.clear()
        clearLocalData()
        if (refresh != null) runCatching { api.logout(RefreshRequest(refresh)) }
    }

    private fun mapError(status: Int, raw: String?): AuthError {
        val code = raw?.let { runCatching { json.decodeFromString<ApiErrorDto>(it).error.code }.getOrNull() }
        return when {
            code == "INVALID_CREDENTIALS" -> AuthError.INVALID_CREDENTIALS
            code == "ACCOUNT_DISABLED" -> AuthError.ACCOUNT_DISABLED
            status == 429 -> AuthError.RATE_LIMITED
            else -> AuthError.UNKNOWN
        }
    }
}

private fun MeDto.toDomain() = User(id = id, email = email, displayName = displayName)
