package be.agendagn.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        HouseholdEntity::class,
        MemberEntity::class,
        CategoryEntity::class,
        OccurrenceEntity::class,
        PendingOperationEntity::class,
        ShoppingItemEntity::class,
    ],
    version = 3,
    exportSchema = true,
)
abstract class AgendaDatabase : RoomDatabase() {
    abstract fun households(): HouseholdDao
    abstract fun occurrences(): OccurrenceDao
    abstract fun pendingOperations(): PendingOperationDao
    abstract fun shopping(): ShoppingDao

    companion object {
        fun create(context: Context): AgendaDatabase =
            Room.databaseBuilder(context, AgendaDatabase::class.java, "agenda.db")
                // Migrations explicites : les actions hors ligne pas encore envoyées survivent aux
                // mises à jour de l'app. Seul un retour à une version plus ancienne vide le cache.
                .addMigrations(*MIGRATIONS)
                .fallbackToDestructiveMigrationOnDowngrade(dropAllTables = true)
                .build()

        /** v2 : sous-tâches (liste JSON dans l'occurrence). */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE occurrences ADD COLUMN checklist TEXT NOT NULL DEFAULT '[]'")
            }
        }

        /** v3 : liste de courses du foyer. */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `shopping_items` (`id` TEXT NOT NULL, `householdId` TEXT NOT NULL, " +
                        "`text` TEXT NOT NULL, `done` INTEGER NOT NULL, `doneById` TEXT, `createdAt` TEXT NOT NULL, " +
                        "`doneAt` TEXT, PRIMARY KEY(`id`))",
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_shopping_items_householdId` ON `shopping_items` (`householdId`)")
            }
        }

        val MIGRATIONS = arrayOf(MIGRATION_1_2, MIGRATION_2_3)
    }
}
