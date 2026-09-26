package be.agendagn.app.data.remote

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class MeDto(val id: String, val email: String, val displayName: String, val locale: String)

@Serializable
data class AuthResponseDto(
    val user: MeDto,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val accessTokenExpiresIn: Int,
)

@Serializable
data class ApiErrorDto(val error: ApiErrorBody) {
    @Serializable
    data class ApiErrorBody(val code: String, val message: String)
}
