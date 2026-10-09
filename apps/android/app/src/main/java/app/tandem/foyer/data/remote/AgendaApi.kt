package app.tandem.foyer.data.remote

import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming
import retrofit2.http.Multipart
import retrofit2.http.Part
import okhttp3.MultipartBody
import okhttp3.ResponseBody

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

    @PATCH("v1/me")
    suspend fun updateMe(@Body body: UpdateMeRequest): Response<MeDto>

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

    @GET("v1/households/{h}/series/{id}")
    suspend fun series(@Path("h") householdId: String, @Path("id") id: String): Response<SeriesDto>

    @POST("v1/households/{h}/recurrence/preview")
    suspend fun previewRecurrence(@Path("h") householdId: String, @Body body: JsonObject): Response<List<RecurrencePreviewItemDto>>

    @GET("v1/households/{h}/templates")
    suspend fun templates(@Path("h") householdId: String): Response<List<TaskTemplateDto>>

    @POST("v1/households/{h}/templates/{id}/apply")
    suspend fun applyTemplate(
        @Path("h") householdId: String,
        @Path("id") id: String,
        @Body body: ApplyTemplateRequest,
    ): Response<List<OccurrenceDto>>

    @GET("v1/households/{h}/series/{id}/history")
    suspend fun seriesHistory(@Path("h") householdId: String, @Path("id") id: String): Response<SeriesHistoryDto>

    @GET("v1/households/{h}/shopping")
    suspend fun shopping(@Path("h") householdId: String): Response<List<ShoppingItemDto>>

    @POST("v1/households/{h}/shopping")
    suspend fun addShopping(@Path("h") householdId: String, @Body body: ShoppingItemRequest): Response<ShoppingItemDto>

    @PATCH("v1/households/{h}/shopping/{id}")
    suspend fun updateShopping(
        @Path("h") householdId: String,
        @Path("id") id: String,
        @Body body: ShoppingUpdateRequest,
    ): Response<ShoppingItemDto>

    @DELETE("v1/households/{h}/shopping/{id}")
    suspend fun deleteShopping(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/shopping/suggestions")
    suspend fun shoppingSuggestions(@Path("h") householdId: String): Response<List<ShoppingSuggestionDto>>

    @POST("v1/households/{h}/shopping/clear-done")
    suspend fun clearShopping(@Path("h") householdId: String): Response<Unit>

    @PUT("v1/me/push-tokens")
    suspend fun registerPushToken(@Body body: PushTokenRequest): Response<Unit>

    @DELETE("v1/me/push-tokens/{token}")
    suspend fun unregisterPushToken(@Path("token") token: String): Response<Unit>

    @POST("v1/households/{h}/occurrences/{id}/checklist")
    suspend fun addChecklistItem(
        @Path("h") householdId: String,
        @Path("id") id: String,
        @Body body: ChecklistItemRequest,
    ): Response<OccurrenceDto>

    @PATCH("v1/households/{h}/occurrences/{id}/checklist/{item}")
    suspend fun updateChecklistItem(
        @Path("h") householdId: String,
        @Path("id") id: String,
        @Path("item") itemId: String,
        @Body body: ChecklistUpdateRequest,
    ): Response<OccurrenceDto>

    @DELETE("v1/households/{h}/occurrences/{id}/checklist/{item}")
    suspend fun removeChecklistItem(
        @Path("h") householdId: String,
        @Path("id") id: String,
        @Path("item") itemId: String,
    ): Response<OccurrenceDto>

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

    @GET("v1/households/{h}/meals")
    suspend fun meals(@Path("h") householdId: String, @Query("from") from: String, @Query("to") to: String): Response<List<MealDto>>

    @POST("v1/households/{h}/meals/shopping")
    suspend fun mealsToShopping(@Path("h") householdId: String, @Body body: MealsToShoppingRequest): Response<MealsToShoppingDto>

    @POST("v1/households/{h}/occurrences/{id}/thanks")
    suspend fun thank(@Path("h") householdId: String, @Path("id") id: String): Response<OccurrenceDto>

    @DELETE("v1/households/{h}/occurrences/{id}/thanks")
    suspend fun unthank(@Path("h") householdId: String, @Path("id") id: String): Response<OccurrenceDto>

    @GET("v1/households/{h}/occurrences/{id}")
    suspend fun occurrence(@Path("h") householdId: String, @Path("id") id: String): Response<OccurrenceDto>

    @Multipart
    @POST("v1/households/{h}/occurrences/{id}/attachments")
    suspend fun uploadAttachment(
        @Path("h") householdId: String,
        @Path("id") occurrenceId: String,
        @Part file: MultipartBody.Part,
    ): Response<OccurrenceDto>

    @DELETE("v1/households/{h}/attachments/{id}")
    suspend fun deleteAttachment(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/activity")
    suspend fun activity(
        @Path("h") householdId: String,
        @Query("before") before: String? = null,
        @Query("limit") limit: Int = 50,
    ): Response<ActivityPageDto>

    @GET("v1/households/{h}/trash")
    suspend fun trash(@Path("h") householdId: String): Response<List<TrashItemDto>>

    @POST("v1/households/{h}/trash/{id}/restore")
    suspend fun restoreTrash(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/occurrences/{id}/comments")
    suspend fun comments(@Path("h") householdId: String, @Path("id") occurrenceId: String): Response<List<CommentDto>>

    @POST("v1/households/{h}/occurrences/{id}/comments")
    suspend fun addComment(
        @Path("h") householdId: String,
        @Path("id") occurrenceId: String,
        @Body body: CreateCommentBody,
    ): Response<CommentDto>

    @DELETE("v1/households/{h}/comments/{id}")
    suspend fun deleteComment(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/absences")
    suspend fun absences(@Path("h") householdId: String): Response<List<AbsenceDto>>

    @POST("v1/households/{h}/absences")
    suspend fun createAbsence(@Path("h") householdId: String, @Body body: CreateAbsenceBody): Response<AbsenceDto>

    @DELETE("v1/households/{h}/absences/{id}")
    suspend fun deleteAbsence(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/important-dates")
    suspend fun importantDates(@Path("h") householdId: String): Response<List<ImportantDateDto>>

    @POST("v1/households/{h}/important-dates")
    suspend fun createImportantDate(@Path("h") householdId: String, @Body body: ImportantDateBody): Response<ImportantDateDto>

    @PUT("v1/households/{h}/important-dates/{id}")
    suspend fun updateImportantDate(@Path("h") householdId: String, @Path("id") id: String, @Body body: ImportantDateBody): Response<ImportantDateDto>

    @DELETE("v1/households/{h}/important-dates/{id}")
    suspend fun deleteImportantDate(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/notes")
    suspend fun notes(@Path("h") householdId: String): Response<List<NoteDto>>

    @POST("v1/households/{h}/notes")
    suspend fun createNote(@Path("h") householdId: String, @Body body: NoteBody): Response<NoteDto>

    @PATCH("v1/households/{h}/notes/{id}")
    suspend fun updateNote(@Path("h") householdId: String, @Path("id") id: String, @Body body: UpdateNoteBody): Response<NoteDto>

    @DELETE("v1/households/{h}/notes/{id}")
    suspend fun deleteNote(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/expenses")
    suspend fun expenses(@Path("h") householdId: String, @Query("month") month: String): Response<List<ExpenseDto>>

    @GET("v1/households/{h}/expenses/summary")
    suspend fun expenseSummary(@Path("h") householdId: String, @Query("month") month: String): Response<ExpenseSummaryDto>

    @POST("v1/households/{h}/expenses")
    suspend fun createExpense(@Path("h") householdId: String, @Body body: ExpenseBody): Response<ExpenseDto>

    @PATCH("v1/households/{h}/expenses/{id}")
    suspend fun updateExpense(@Path("h") householdId: String, @Path("id") id: String, @Body body: ExpenseBody): Response<ExpenseDto>

    @POST("v1/households/{h}/expenses/settle")
    suspend fun settleExpenses(@Path("h") householdId: String, @Body body: SettleBody): Response<ExpenseDto>

    @DELETE("v1/households/{h}/expenses/{id}")
    suspend fun deleteExpense(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/expenses/recurring")
    suspend fun recurringExpenses(@Path("h") householdId: String): Response<List<RecurringExpenseDto>>

    @POST("v1/households/{h}/expenses/recurring")
    suspend fun createRecurringExpense(@Path("h") householdId: String, @Body body: RecurringExpenseBody): Response<RecurringExpenseDto>

    @DELETE("v1/households/{h}/expenses/recurring/{id}")
    suspend fun stopRecurringExpense(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @Multipart
    @POST("v1/households/{h}/expenses/{id}/receipt")
    suspend fun uploadReceipt(@Path("h") householdId: String, @Path("id") id: String, @Part file: MultipartBody.Part): Response<ExpenseDto>

    @Streaming
    @GET("v1/households/{h}/expenses/{id}/receipt")
    suspend fun receipt(@Path("h") householdId: String, @Path("id") id: String): Response<ResponseBody>

    @GET("v1/households/{h}/swaps")
    suspend fun swaps(@Path("h") householdId: String): Response<SwapListDto>

    @POST("v1/households/{h}/occurrences/{id}/swap")
    suspend fun requestSwap(@Path("h") householdId: String, @Path("id") occurrenceId: String, @Body body: SwapRequestBody): Response<SwapDto>

    @POST("v1/households/{h}/swaps/{id}/accept")
    suspend fun acceptSwap(@Path("h") householdId: String, @Path("id") id: String): Response<SwapDto>

    @POST("v1/households/{h}/swaps/{id}/decline")
    suspend fun declineSwap(@Path("h") householdId: String, @Path("id") id: String): Response<SwapDto>

    @DELETE("v1/households/{h}/swaps/{id}")
    suspend fun cancelSwap(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @DELETE("v1/households/{h}/expenses/{id}/receipt")
    suspend fun deleteReceipt(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/expenses/stats")
    suspend fun expenseStats(
        @Path("h") householdId: String,
        @Query("month") month: String,
        @Query("months") months: Int = 6,
    ): Response<ExpenseStatsDto>

    /** Corps `{ "budgetCents": 12000 }` ou `{ "budgetCents": null }` (null explicite : pas de budget). */
    @PUT("v1/households/{h}/expenses/budget")
    suspend fun setExpenseBudget(@Path("h") householdId: String, @Body body: JsonObject): Response<Unit>

    @PUT("v1/households/{h}/expenses/budget/categories")
    suspend fun setCategoryBudgets(@Path("h") householdId: String, @Body body: CategoryBudgetsBody): Response<Unit>

    /** Export tableur (CSV, dans la langue du compte), de `from` à `to` inclus. */
    @Streaming
    @GET("v1/households/{h}/expenses/export")
    suspend fun exportExpenses(
        @Path("h") householdId: String,
        @Query("from") from: String,
        @Query("to") to: String,
    ): Response<ResponseBody>

    /** Contenu d'une pièce jointe (téléchargé à la demande, puis ouvert par une autre app). */
    @Streaming
    @GET("v1/households/{h}/attachments/{id}")
    suspend fun attachment(@Path("h") householdId: String, @Path("id") id: String): Response<ResponseBody>

    /** Annule la dernière suppression de cette occurrence (corbeille, 30 jours). */
    @POST("v1/households/{h}/occurrences/{id}/restore")
    suspend fun restoreOccurrence(@Path("h") householdId: String, @Path("id") id: String): Response<Unit>

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

    // ── Signalements ──
    @POST("v1/reports")
    suspend fun createReport(@Body body: CreateReportBody): Response<ReportDto>

    @Multipart
    @POST("v1/reports/{id}/screenshot")
    suspend fun uploadReportScreenshot(@Path("id") id: String, @Part file: MultipartBody.Part): Response<ReportDto>

    @GET("v1/reports")
    suspend fun reports(): Response<List<ReportDto>>

    @DELETE("v1/reports/{id}")
    suspend fun deleteReport(@Path("id") id: String): Response<Unit>

    @GET("v1/households/{h}/search")
    suspend fun search(@Path("h") householdId: String, @Query("q") q: String): Response<SearchResultsDto>

    @GET("v1/me/sessions")
    suspend fun deviceSessions(): Response<List<DeviceSessionDto>>

    @DELETE("v1/me/sessions")
    suspend fun revokeOtherDeviceSessions(): Response<Unit>

    @DELETE("v1/me/sessions/{id}")
    suspend fun revokeDeviceSession(@Path("id") id: String): Response<Unit>
}
