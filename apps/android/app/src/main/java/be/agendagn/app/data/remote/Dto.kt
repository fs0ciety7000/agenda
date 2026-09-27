package be.agendagn.app.data.remote

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class NotificationDto(
    val id: String,
    val type: String,
    val createdAt: String,
    val readAt: String? = null,
    val push: Boolean = true,
    val occurrenceId: String? = null,
    val title: String? = null,
    val recurring: Boolean = false,
    val byName: String? = null,
)

@Serializable
data class NotificationListDto(val unread: Int, val items: List<NotificationDto>)

@Serializable
data class ClientErrorRequest(
    val source: String,
    val message: String,
    val stack: String? = null,
    val location: String? = null,
    val release: String? = null,
)

@Serializable
data class MobileExchangeRequest(val code: String, val codeVerifier: String)

@Serializable
data class ProvidersDto(val google: Boolean = false, val registration: Boolean = true, val passwordReset: Boolean = false)

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

@Serializable
data class MemberDto(
    val id: String,
    val userId: String? = null,
    val displayName: String,
    val role: String,
    val color: String,
)

@Serializable
data class HouseholdDto(val id: String, val name: String, val timezone: String, val members: List<MemberDto>)

@Serializable
data class CategoryDto(val id: String, val name: String, val emoji: String? = null, val position: Int = 0)

@Serializable
data class CategoryRefDto(val id: String, val name: String, val emoji: String? = null)

@Serializable
data class OccurrenceDto(
    val id: String,
    val taskId: String,
    val title: String,
    val notes: String? = null,
    val category: CategoryRefDto? = null,
    val priority: String,
    val visibility: String,
    val status: String,
    val date: String? = null,
    val dueDate: String? = null,
    val startMinute: Int? = null,
    val durationMinutes: Int? = null,
    val assigneeIds: List<String>,
    val createdById: String,
    val isRecurring: Boolean,
    val seriesId: String? = null,
    val syncToCalendar: Boolean = false,
    val calendarSync: String? = null,
    val isException: Boolean = false,
    val completedAt: String? = null,
    val version: Int,
    val checklist: List<ChecklistItemDto> = emptyList(),
    val attachments: List<AttachmentDto> = emptyList(),
    val lastDone: LastDoneDto? = null,
)

@Serializable
data class LastDoneDto(val at: String, val memberId: String? = null)

/** Journal d'activité (cf. packages/contracts/src/activity.ts). */
@Serializable
data class ActivityDto(
    val id: String,
    val action: String,
    val at: String,
    val actorId: String? = null,
    val title: String? = null,
    val date: String? = null,
    val fields: List<String> = emptyList(),
)

@Serializable
data class ActivityPageDto(val items: List<ActivityDto>, val next: String? = null)

@Serializable
data class TrashItemDto(
    val id: String,
    val kind: String,
    val title: String,
    val date: String? = null,
    val deletedAt: String,
    val deletedById: String? = null,
    val purgeAt: String,
)

@Serializable
data class AttachmentDto(val id: String, val filename: String, val contentType: String, val size: Long)

@Serializable
data class ChecklistItemDto(val id: String, val text: String, val done: Boolean, val doneById: String? = null)

@Serializable
data class PushTokenRequest(val token: String, val platform: String = "android")

@Serializable
data class ChecklistItemRequest(val text: String)

@Serializable
data class ChecklistUpdateRequest(val done: Boolean)

@Serializable
data class QuickAddRequest(val text: String)

@Serializable
data class QuickAddPreviewDto(
    val title: String,
    val date: String? = null,
    val startMinute: Int? = null,
    val durationMinutes: Int? = null,
    val assigneeIds: List<String>? = null,
    val categoryId: String? = null,
    val priority: String? = null,
)

@Serializable
data class CalendarStatusDto(
    val configured: Boolean,
    val connection: Connection? = null,
    val link: Link? = null,
    val stats: Stats,
) {
    @Serializable
    data class Connection(val email: String, val status: String)

    @Serializable
    data class Link(
        val summary: String,
        val status: String,
        val errorCode: String? = null,
        val connectionEmail: String,
    )

    @Serializable
    data class Stats(val synced: Int, val pending: Int, val errors: Int)
}

/** Corps de création : construit par `TaskPayloads` (récurrence en JSON libre, cf. contracts). */
typealias CreateTaskBody = JsonObject

@Serializable
data class SeriesDto(
    val id: String,
    val startDate: String,
    val untilDate: String? = null,
    val count: Int? = null,
    val rule: kotlinx.serialization.json.JsonObject,
    val rotation: kotlinx.serialization.json.JsonObject,
    val advance: String = "PER_OCCURRENCE",
)

@Serializable
data class RecurrencePreviewItemDto(val date: String, val assigneeIds: List<String>)

@Serializable
data class ShoppingItemDto(
    val id: String,
    val text: String,
    val done: Boolean,
    val doneById: String? = null,
    val createdAt: String,
    val doneAt: String? = null,
)

@Serializable
data class ShoppingItemRequest(val id: String, val text: String)

@Serializable
data class ShoppingUpdateRequest(val done: Boolean)

@Serializable
data class TemplateItemDto(val title: String)

@Serializable
data class TaskTemplateDto(val id: String, val name: String, val emoji: String? = null, val items: List<TemplateItemDto>)

@Serializable
data class ApplyTemplateRequest(val date: String? = null)

@Serializable
data class SeriesHistoryItemDto(
    val occurrenceId: String,
    val date: String? = null,
    val status: String,
    val completedById: String? = null,
)

@Serializable
data class DoneCountDto(val memberId: String, val count: Int)

@Serializable
data class SeriesHistoryDto(val items: List<SeriesHistoryItemDto>, val doneBy: List<DoneCountDto>)

/** Mode absence (cf. packages/contracts/src/absences.ts). */
@Serializable
data class AbsenceDto(val id: String, val memberId: String, val startDate: String, val endDate: String)

@Serializable
data class CreateAbsenceBody(val memberId: String, val startDate: String, val endDate: String)
