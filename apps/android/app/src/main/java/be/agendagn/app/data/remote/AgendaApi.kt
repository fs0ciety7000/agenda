package be.agendagn.app.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** Même API REST que le web : aucune logique métier propre à Android. */
interface AgendaApi {
    @POST("v1/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponseDto>

    @POST("v1/auth/refresh")
    fun refreshBlocking(@Body body: RefreshRequest): retrofit2.Call<AuthResponseDto>

    @POST("v1/auth/logout")
    suspend fun logout(@Body body: RefreshRequest): Response<Unit>

    @GET("v1/me")
    suspend fun me(): Response<MeDto>
}
