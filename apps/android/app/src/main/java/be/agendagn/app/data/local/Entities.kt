package be.agendagn.app.data.local

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
    }
}
