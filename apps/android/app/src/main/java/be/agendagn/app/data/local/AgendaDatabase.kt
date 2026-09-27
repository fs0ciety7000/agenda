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
    version = 6,
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

        /** v4 : échéance souple des tâches sans date. */
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE occurrences ADD COLUMN dueDate TEXT DEFAULT NULL")
            }
        }

        /** v5 : pièces jointes des tâches (métadonnées). */
        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE occurrences ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")
            }
        }

        /** v6 : dernière fois qu'une tâche récurrente a été faite. */
        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE occurrences ADD COLUMN lastDoneAt TEXT DEFAULT NULL")
                db.execSQL("ALTER TABLE occurrences ADD COLUMN lastDoneById TEXT DEFAULT NULL")
            }
        }

        val MIGRATIONS = arrayOf(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6)
    }
}
