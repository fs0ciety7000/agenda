package be.agendagn.app.data.remote

import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

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

    @POST("v1/client-errors")
    suspend fun reportClientError(@Body body: ClientErrorRequest): Response<Unit>

    @GET("v1/auth/providers")
    suspend fun providers(): Response<ProvidersDto>

    @POST("v1/auth/google/mobile/exchange")
    suspend fun googleMobileExchange(@Body body: MobileExchangeRequest): Response<AuthResponseDto>

    @GET("v1/households")
    suspend fun households(): Response<List<HouseholdDto>>

    @GET("v1/households/{h}/categories")
    suspend fun categories(@Path("h") householdId: String): Response<List<CategoryDto>>

    @GET("v1/households/{h}/occurrences")
    suspend fun occurrences(
        @Path("h") householdId: String,
        @Query("view") view: String,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("limit") limit: Int = 500,
    ): Response<List<OccurrenceDto>>

    @POST("v1/households/{h}/tasks")
    suspend fun createTask(
        @Path("h") householdId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject,
    ): Response<OccurrenceDto>

    @POST("v1/households/{h}/tasks/quick")
    suspend fun quickAdd(
        @Path("h") householdId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: QuickAddRequest,
    ): Response<OccurrenceDto>

    @POST("v1/households/{h}/quick-add/parse")
    suspend fun parseQuickAdd(@Path("h") householdId: String, @Body body: QuickAddRequest): Response<QuickAddPreviewDto>

    @PATCH("v1/households/{h}/occurrences/{id}")
    suspend fun updateOccurrence(
        @Path("h") householdId: String,
        @Path("id") id: String,
        @Query("scope") scope: String,
        @Body body: JsonObject,
    ): Response<OccurrenceDto>

    @POST("v1/households/{h}/occurrences/{id}/complete")
    suspend fun complete(@Path("h") householdId: String, @Path("id") id: String): Response<OccurrenceDto>

    @POST("v1/households/{h}/occurrences/{id}/reopen")
    suspend fun reopen(@Path("h") householdId: String, @Path("id") id: String): Response<OccurrenceDto>

    @DELETE("v1/households/{h}/occurrences/{id}")
    suspend fun deleteOccurrence(
        @Path("h") householdId: String,
        @Path("id") id: String,
        @Query("scope") scope: String,
    ): Response<Unit>

    @GET("v1/households/{h}/notifications")
    suspend fun notifications(
        @Path("h") householdId: String,
        @Query("since") since: String? = null,
        @Query("limit") limit: Int = 20,
    ): Response<NotificationListDto>

    @GET("v1/households/{h}/calendar")
    suspend fun calendarStatus(@Path("h") householdId: String): Response<CalendarStatusDto>
}
