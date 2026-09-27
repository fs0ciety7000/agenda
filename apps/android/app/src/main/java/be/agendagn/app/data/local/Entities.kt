package be.agendagn.app.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Cache local (ADR-007) : copie des données serveur, jamais la source de vérité. */
@Entity(tableName = "households")
data class HouseholdEntity(
    @PrimaryKey val id: String,
    val name: String,
    val timezone: String,
    /** Membre correspondant à l'utilisateur connecté dans ce foyer. */
    val myMemberId: String?,
)

@Entity(tableName = "members", indices = [Index("householdId")])
data class MemberEntity(
    @PrimaryKey val id: String,
    val householdId: String,
    val userId: String?,
    val displayName: String,
    val color: String,
    val position: Int,
)

@Entity(tableName = "categories", indices = [Index("householdId")])
data class CategoryEntity(
    @PrimaryKey val id: String,
    val householdId: String,
    val name: String,
    val emoji: String?,
    val position: Int,
)

@Entity(tableName = "occurrences", indices = [Index("householdId"), Index("date")])
data class OccurrenceEntity(
    @PrimaryKey val id: String,
    val householdId: String,
    val taskId: String,
    val title: String,
    val notes: String?,
    val categoryId: String?,
    val categoryName: String?,
    val categoryEmoji: String?,
    val priority: String,
    val visibility: String,
    val status: String,
    /** ISO-8601 (AAAA-MM-JJ) : trié correctement comme texte. */
    val date: String?,
    /** Échéance souple d'une tâche sans date (v4). */
    @ColumnInfo(defaultValue = "NULL") val dueDate: String? = null,
    val startMinute: Int?,
    val durationMinutes: Int?,
    /** Identifiants séparés par des virgules (des UUID : jamais de virgule). */
    val assigneeIds: String,
    val createdById: String,
    val isRecurring: Boolean,
    val seriesId: String?,
    val syncToCalendar: Boolean,
    val calendarSync: String?,
    val completedAt: String?,
    val version: Int,
    /** Créée hors ligne (id provisoire `local-…`), en attente d'envoi. */
    val isLocal: Boolean = false,
    /** Sous-tâches, en JSON (liste de [be.agendagn.app.data.remote.ChecklistItemDto]). */
    @ColumnInfo(defaultValue = "[]")
    val checklist: String = "[]",
    /** Pièces jointes (métadonnées), en JSON (liste de [be.agendagn.app.data.remote.AttachmentDto]). */
    @ColumnInfo(defaultValue = "[]")
    val attachments: String = "[]",
    /** Tâche récurrente : dernière fois faite (ISO) et par qui. */
    val lastDoneAt: String? = null,
    val lastDoneById: String? = null,
)

/**
 * Outbox : actions faites hors ligne, rejouées dans l'ordre par [be.agendagn.app.data.sync.SyncWorker].
 * Cocher / décocher sont idempotents côté serveur ; les créations portent une `Idempotency-Key`.
 */
@Entity(tableName = "pending_operations")
data class PendingOperationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val householdId: String,
    val type: String,
    /** Occurrence visée (id local provisoire pour une création). */
    val occurrenceId: String,
    /** Corps JSON de la requête (création) ou null. */
    val payload: String?,
    val idempotencyKey: String,
    val createdAt: Long,
    val attempts: Int = 0,
) {
    companion object {
        const val COMPLETE = "COMPLETE"
        const val REOPEN = "REOPEN"
        const val CREATE = "CREATE"
        const val QUICK_ADD = "QUICK_ADD"

        // Liste de courses (occurrenceId = id de l'article, choisi par le téléphone).
        const val SHOP_ADD = "SHOP_ADD"
        const val SHOP_SET = "SHOP_SET"
        const val SHOP_DELETE = "SHOP_DELETE"
        const val SHOP_CLEAR = "SHOP_CLEAR"
    }
}

/** Liste de courses du foyer (copie serveur + ajouts / coches pas encore envoyés). */
@Entity(tableName = "shopping_items", indices = [Index("householdId")])
data class ShoppingItemEntity(
    @PrimaryKey val id: String,
    val householdId: String,
    val text: String,
    val done: Boolean,
    val doneById: String?,
    val createdAt: String,
    val doneAt: String?,
)
