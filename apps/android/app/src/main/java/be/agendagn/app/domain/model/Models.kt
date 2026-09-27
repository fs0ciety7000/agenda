package be.agendagn.app.domain.model

import be.agendagn.app.domain.RecurrenceSpec
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
    val seriesId: String? = null,
    val syncToCalendar: Boolean,
    val calendarSync: CalendarSync?,
    val completedAt: Instant?,
    val version: Int,
    /** Créée ou modifiée hors ligne, pas encore confirmée par le serveur. */
    val pending: Boolean = false,
    /** Créée hors ligne : id local provisoire, non modifiable avant synchronisation. */
    val isLocal: Boolean = false,
    /** Sous-tâches / liste (ex. courses). */
    val checklist: List<ChecklistItem> = emptyList(),
    /** Tâche sans date : à faire au plus tard ce jour-là (« cette semaine » = dimanche). */
    val dueDate: LocalDate? = null,
) {
    val isDone: Boolean get() = status == OccurrenceStatus.DONE
}

data class ChecklistItem(val id: String, val text: String, val done: Boolean)

/** Article de la liste de courses du foyer ([doneById] : qui l'a mis dans le panier). */
data class ShoppingItem(val id: String, val text: String, val done: Boolean, val doneById: String? = null)

/** Saisie du formulaire de création / modification. */
data class TaskDraft(
    val title: String = "",
    val notes: String = "",
    val date: LocalDate? = null,
    /** Échéance souple, seulement sans date. */
    val dueDate: LocalDate? = null,
    val startMinute: Int? = null,
    val durationMinutes: Int? = null,
    val assigneeIds: List<String> = emptyList(),
    val categoryId: String? = null,
    val priority: Priority = Priority.NORMAL,
    val personal: Boolean = false,
    /** Répétition et rotation des responsables (aucune par défaut). */
    val recurrence: RecurrenceSpec = RecurrenceSpec(),
    val syncToCalendar: Boolean = false,
    /** Création : éléments de la liste (envoyés avec la tâche). */
    val checklist: List<String> = emptyList(),
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

/** Modèle de tâches (« Ménage du samedi ») : ses tâches sont créées d'un coup. */
data class TaskTemplate(val id: String, val name: String, val emoji: String?, val titles: List<String>) {
    val label: String get() = listOfNotNull(emoji, name).joinToString(" ")
}

/** Historique d'une tâche récurrente : qui l'a faite, et quand. */
data class SeriesHistory(val items: List<Item>, val doneBy: List<Pair<String, Int>>) {
    data class Item(val date: LocalDate?, val done: Boolean, val skipped: Boolean, val completedById: String?)
}
