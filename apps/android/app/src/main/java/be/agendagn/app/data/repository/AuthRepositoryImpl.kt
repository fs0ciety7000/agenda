package be.agendagn.app.data.repository

import be.agendagn.app.data.auth.TokenStore
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.data.remote.ApiErrorDto
import be.agendagn.app.data.remote.LoginRequest
import be.agendagn.app.data.remote.MeDto
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

    override suspend fun currentUser(): User? = try {
        api.me().body()?.toDomain()
    } catch (_: IOException) {
        null
    }

    override suspend fun logout() {
        val refresh = tokens.refreshToken()
        tokens.clear()
        if (refresh != null) runCatching { api.logout(RefreshRequest(refresh)) }
    }

    private fun mapError(status: Int, raw: String?): AuthError {
        val code = raw?.let { runCatching { json.decodeFromString<ApiErrorDto>(it).error.code }.getOrNull() }
        return when {
            code == "INVALID_CREDENTIALS" -> AuthError.INVALID_CREDENTIALS
            status == 429 -> AuthError.RATE_LIMITED
            else -> AuthError.UNKNOWN
        }
    }
}

private fun MeDto.toDomain() = User(id = id, email = email, displayName = displayName)
