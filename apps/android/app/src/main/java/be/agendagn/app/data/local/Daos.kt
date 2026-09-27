package be.agendagn.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface HouseholdDao {
    @Query("SELECT * FROM households ORDER BY name LIMIT 1")
    fun observeCurrent(): Flow<HouseholdEntity?>

    @Query("SELECT * FROM households ORDER BY name LIMIT 1")
    suspend fun current(): HouseholdEntity?

    @Query("SELECT * FROM members WHERE householdId = :householdId ORDER BY position")
    fun observeMembers(householdId: String): Flow<List<MemberEntity>>

    @Query("SELECT * FROM categories WHERE householdId = :householdId ORDER BY position")
    fun observeCategories(householdId: String): Flow<List<CategoryEntity>>

    @Transaction
    suspend fun replace(household: HouseholdEntity, members: List<MemberEntity>, categories: List<CategoryEntity>) {
        clearHouseholds()
        insertHousehold(household)
        clearMembers()
        insertMembers(members)
        clearCategories()
        insertCategories(categories)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertHousehold(h: HouseholdEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertMembers(m: List<MemberEntity>)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertCategories(c: List<CategoryEntity>)
    @Query("DELETE FROM households") suspend fun clearHouseholds()
    @Query("DELETE FROM members") suspend fun clearMembers()
    @Query("DELETE FROM categories") suspend fun clearCategories()
}

@Dao
interface OccurrenceDao {
    @Query("SELECT * FROM occurrences WHERE householdId = :householdId")
    fun observeAll(householdId: String): Flow<List<OccurrenceEntity>>

    @Query("SELECT * FROM occurrences WHERE id = :id")
    suspend fun get(id: String): OccurrenceEntity?

    @Query("SELECT * FROM occurrences WHERE id = :id")
    fun observe(id: String): Flow<OccurrenceEntity?>

    @Upsert suspend fun upsert(o: OccurrenceEntity)
    @Upsert suspend fun upsertAll(o: List<OccurrenceEntity>)

    @Query("DELETE FROM occurrences WHERE id = :id") suspend fun delete(id: String)

    @Query("DELETE FROM occurrences WHERE householdId = :householdId AND isLocal = 0")
    suspend fun deleteServerRows(householdId: String)

    @Query("UPDATE occurrences SET status = :status, completedAt = :completedAt WHERE id = :id")
    suspend fun setStatus(id: String, status: String, completedAt: String?)

    @Query("UPDATE occurrences SET date = :date WHERE id = :id")
    suspend fun setDate(id: String, date: String)

    /** Remplace le cache serveur, en conservant les créations locales non encore envoyées. */
    @Transaction
    suspend fun replaceServerRows(householdId: String, rows: List<OccurrenceEntity>) {
        deleteServerRows(householdId)
        upsertAll(rows)
    }
}

@Dao
interface PendingOperationDao {
    @Insert suspend fun insert(op: PendingOperationEntity): Long

    @Query("SELECT * FROM pending_operations ORDER BY id LIMIT 1")
    suspend fun next(): PendingOperationEntity?

    @Query("SELECT * FROM pending_operations ORDER BY id")
    suspend fun all(): List<PendingOperationEntity>

    @Query("SELECT COUNT(*) FROM pending_operations")
    fun observeCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM pending_operations")
    suspend fun count(): Int

    @Query("SELECT DISTINCT occurrenceId FROM pending_operations")
    fun observePendingOccurrenceIds(): Flow<List<String>>

    @Query("DELETE FROM pending_operations WHERE id = :id") suspend fun delete(id: Long)

    @Query("UPDATE pending_operations SET attempts = attempts + 1 WHERE id = :id")
    suspend fun incrementAttempts(id: Long)

    /** Après la création côté serveur : les actions suivantes visent le vrai identifiant. */
    @Query("UPDATE pending_operations SET occurrenceId = :serverId WHERE occurrenceId = :localId")
    suspend fun remap(localId: String, serverId: String)
}

@Dao
interface ShoppingDao {
    /** À acheter (ordre d'ajout), puis dans le panier (les plus récents d'abord), comme l'API. */
    @Query(
        "SELECT * FROM shopping_items WHERE householdId = :householdId " +
            "ORDER BY done, CASE WHEN done THEN doneAt END DESC, createdAt",
    )
    fun observe(householdId: String): Flow<List<ShoppingItemEntity>>

    @Upsert suspend fun upsert(item: ShoppingItemEntity)

    @Query("UPDATE shopping_items SET done = :done, doneById = :by, doneAt = :at WHERE id = :id")
    suspend fun setDone(id: String, done: Boolean, by: String?, at: String?)

    @Query("UPDATE shopping_items SET aisle = :aisle WHERE id = :id")
    suspend fun setAisle(id: String, aisle: String)

    @Query("DELETE FROM shopping_items WHERE id = :id") suspend fun delete(id: String)

    @Query("DELETE FROM shopping_items WHERE householdId = :householdId AND done = 1")
    suspend fun deleteDone(householdId: String)

    @Query("DELETE FROM shopping_items WHERE householdId = :householdId") suspend fun clear(householdId: String)

    @Transaction
    suspend fun replace(householdId: String, items: List<ShoppingItemEntity>) {
        clear(householdId)
        items.forEach { upsert(it) }
    }
}
