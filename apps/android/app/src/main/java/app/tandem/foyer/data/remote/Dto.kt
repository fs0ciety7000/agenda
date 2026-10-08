package app.tandem.foyer.data.remote

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
    /** EXPENSE_BUDGET : mois (« 2026-10 »), seuil atteint (80 ou 100), dépensé et budget. */
    val month: String? = null,
    val level: Int? = null,
    val amountCents: Long? = null,
    val budgetCents: Long? = null,
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
data class UpdateMeRequest(val locale: String)

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
    val commentCount: Int = 0,
    val completedById: String? = null,
    /** Membres qui ont dit « merci » pour cette tâche faite. */
    val thankedBy: List<String> = emptyList(),
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
    val quantity: String? = null,
    val aisle: String? = null,
)

@Serializable
data class ShoppingSuggestionDto(val text: String, val aisle: String = "OTHER", val timesBought: Int = 0)

@Serializable
data class ShoppingItemRequest(val id: String, val text: String)

@Serializable
data class ShoppingUpdateRequest(val done: Boolean? = null, val aisle: String? = null)

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

/** Commentaire sur une tâche (cf. packages/contracts/src/comments.ts). */
@Serializable
data class CommentDto(val id: String, val authorId: String? = null, val body: String, val createdAt: String)

@Serializable
data class CreateCommentBody(val body: String)

/** Signalements (cf. packages/contracts/src/reports.ts). */
@Serializable
data class ReportDiagnosticsDto(
    val platform: String = "android",
    val appVersion: String? = null,
    val os: String? = null,
    val device: String? = null,
    val locale: String? = null,
    val timezone: String? = null,
    val screen: String? = null,
    val page: String? = null,
    val online: Boolean? = null,
    val pendingChanges: Int? = null,
)

@Serializable
data class CreateReportBody(
    val kind: String,
    val title: String,
    val description: String,
    val allowContact: Boolean,
    val diagnostics: ReportDiagnosticsDto? = null,
)

@Serializable
data class ReportDto(
    val id: String,
    val kind: String,
    val status: String,
    val title: String,
    val description: String,
    val allowContact: Boolean = false,
    val hasScreenshot: Boolean = false,
    val reply: String? = null,
    val createdAt: String,
)

@Serializable
data class MealDto(
    val id: String,
    val date: String,
    val slot: String,
    val title: String,
    val ingredients: List<String> = emptyList(),
    val addedToShoppingAt: String? = null,
)

@Serializable
data class MealsToShoppingRequest(val mealIds: List<String>)

@Serializable
data class MealsToShoppingDto(val added: Int, val skipped: Int)

/** Dépenses du foyer (cf. packages/contracts/src/expenses.ts). Montants en centimes d'euro. */
@Serializable
data class ExpenseShareDto(val memberId: String, val amountCents: Long)

@Serializable
data class ExpenseDto(
    val id: String,
    val kind: String,
    val paidById: String,
    val amountCents: Long,
    val date: String,
    val title: String,
    val category: String,
    val split: String,
    val forMemberId: String? = null,
    val note: String? = null,
    val shares: List<ExpenseShareDto> = emptyList(),
    val hasReceipt: Boolean = false,
    val recurringId: String? = null,
)

/** Création (avec identifiant : un renvoi ne crée pas de doublon) ou modification. */
@Serializable
data class ExpenseBody(
    val id: String? = null,
    val paidById: String,
    val amountCents: Long,
    val date: String,
    val title: String,
    val category: String,
    val split: String,
    val forMemberId: String? = null,
    val note: String,
    /** Parts saisies à la main (partage « CUSTOM ») ; leur somme vaut le montant. */
    val shares: List<ExpenseShareDto>? = null,
)

/** Charge fixe : une dépense ajoutée chaque mois, le même jour. */
@Serializable
data class RecurringExpenseDto(
    val id: String,
    val paidById: String,
    val amountCents: Long,
    val title: String,
    val category: String,
    val split: String,
    val forMemberId: String? = null,
    val note: String? = null,
    val dayOfMonth: Int,
    val startDate: String,
)

@Serializable
data class RecurringExpenseBody(
    val paidById: String,
    val amountCents: Long,
    val title: String,
    val category: String,
    val split: String,
    val forMemberId: String? = null,
    val note: String,
    val startDate: String,
)

@Serializable
data class SettleBody(val id: String, val fromMemberId: String, val toMemberId: String, val amountCents: Long)

@Serializable
data class ExpenseMemberSummaryDto(
    val memberId: String,
    val weight: Int,
    val balanceCents: Long,
    val paidCents: Long,
    val shareCents: Long,
)

@Serializable
data class ExpenseTransferDto(val fromMemberId: String, val toMemberId: String, val amountCents: Long)

@Serializable
data class ExpenseCategoryTotalDto(val category: String, val amountCents: Long)

@Serializable
data class ExpenseSummaryDto(
    val month: String,
    val currency: String = "EUR",
    val commonCents: Long,
    val mineCents: Long,
    val members: List<ExpenseMemberSummaryDto> = emptyList(),
    val transfers: List<ExpenseTransferDto> = emptyList(),
    val byCategory: List<ExpenseCategoryTotalDto> = emptyList(),
    /** Budget mensuel des dépenses communes (null = aucun). */
    val budgetCents: Long? = null,
)

/** Un mois de l'évolution : dépenses communes, les miennes, par catégorie. */
@Serializable
data class ExpenseMonthStatsDto(
    val month: String,
    val commonCents: Long,
    val mineCents: Long = 0,
    val byCategory: List<ExpenseCategoryTotalDto> = emptyList(),
)

@Serializable
data class ExpenseStatsDto(
    val currency: String = "EUR",
    val budgetCents: Long? = null,
    /** Du plus ancien au plus récent. */
    val months: List<ExpenseMonthStatsDto> = emptyList(),
)
