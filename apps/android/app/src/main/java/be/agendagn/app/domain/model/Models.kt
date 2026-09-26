package be.agendagn.app.domain.model

import java.time.Instant
import java.time.LocalDate

enum class Priority { LOW, NORMAL, HIGH, URGENT }

enum class Visibility { PERSONAL, SHARED }

enum class OccurrenceStatus { TODO, DONE, SKIPPED, CANCELLED }

enum class CalendarSync { SYNCED, PENDING, ERROR, BLOCKED }

/** Portée d'une modification / suppression d'une tâche récurrente (même sémantique que le web). */
enum class EditScope(val wire: String) { THIS("this"), FOLLOWING("following"), ALL("all") }

enum class MemberColor { SAGE, OCEAN, AMBER, PLUM, CLAY, SLATE }

data class Member(
    val id: String,
    val userId: String?,
    val displayName: String,
    val color: MemberColor,
)

data class Household(
    val id: String,
    val name: String,
    val timezone: String,
    val members: List<Member>,
)

data class Category(val id: String, val name: String, val emoji: String?)

data class Occurrence(
    val id: String,
    val taskId: String,
    val title: String,
    val notes: String?,
    val category: Category?,
    val priority: Priority,
    val visibility: Visibility,
    val status: OccurrenceStatus,
    val date: LocalDate?,
    val startMinute: Int?,
    val durationMinutes: Int?,
    val assigneeIds: List<String>,
    val createdById: String,
    val isRecurring: Boolean,
    val syncToCalendar: Boolean,
    val calendarSync: CalendarSync?,
    val completedAt: Instant?,
    val version: Int,
    /** Créée ou modifiée hors ligne, pas encore confirmée par le serveur. */
    val pending: Boolean = false,
    /** Créée hors ligne : id local provisoire, non modifiable avant synchronisation. */
    val isLocal: Boolean = false,
) {
    val isDone: Boolean get() = status == OccurrenceStatus.DONE
}

/** Répétitions proposées sur mobile (la configuration avancée reste sur le web). */
enum class Repeat { NONE, DAILY, WEEKLY, BIWEEKLY, MONTHLY }

/** Saisie du formulaire de création / modification. */
data class TaskDraft(
    val title: String = "",
    val notes: String = "",
    val date: LocalDate? = null,
    val startMinute: Int? = null,
    val durationMinutes: Int? = null,
    val assigneeIds: List<String> = emptyList(),
    val categoryId: String? = null,
    val priority: Priority = Priority.NORMAL,
    val personal: Boolean = false,
    val repeat: Repeat = Repeat.NONE,
    /** Répétition : les responsables sélectionnés alternent (« chacun son tour »). */
    val alternate: Boolean = false,
    val syncToCalendar: Boolean = false,
)

data class QuickAddPreview(
    val title: String,
    val date: LocalDate?,
    val startMinute: Int?,
    val assigneeIds: List<String>,
    val categoryId: String?,
    val priority: Priority?,
)

enum class CalendarLinkState { NOT_CONFIGURED, NOT_LINKED, ACTIVE, INVALID }

data class CalendarStatus(
    val state: CalendarLinkState,
    val calendarName: String?,
    val connectionEmail: String?,
    val errorCode: String?,
    val synced: Int,
    val pending: Int,
    val errors: Int,
)
