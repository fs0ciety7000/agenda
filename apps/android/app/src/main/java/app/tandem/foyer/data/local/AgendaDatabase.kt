package app.tandem.foyer.data.local

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
        CachedDocumentEntity::class,
    ],
    version = 9,
    exportSchema = true,
)
abstract class AgendaDatabase : RoomDatabase() {
    abstract fun households(): HouseholdDao
    abstract fun occurrences(): OccurrenceDao
    abstract fun pendingOperations(): PendingOperationDao
    abstract fun shopping(): ShoppingDao
    abstract fun cachedDocuments(): CachedDocumentDao

    companion object {
        fun create(context: Context): AgendaDatabase =
            Room.databaseBuilder(context, AgendaDatabase::class.java, "tandem.db")
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

        /** v7 : quantité et rayon des articles de courses. */
        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE shopping_items ADD COLUMN quantity TEXT DEFAULT NULL")
                db.execSQL("ALTER TABLE shopping_items ADD COLUMN aisle TEXT DEFAULT NULL")
            }
        }

        /** v8 : qui a coché la tâche, et les « merci » reçus. */
        val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE occurrences ADD COLUMN completedById TEXT DEFAULT NULL")
                db.execSQL("ALTER TABLE occurrences ADD COLUMN thankedBy TEXT NOT NULL DEFAULT ''")
            }
        }

        /** v9 : copie des notes et dates importantes pour les lire hors ligne. */
        val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `cached_documents` (`key` TEXT NOT NULL, `json` TEXT NOT NULL, " +
                        "`updatedAt` TEXT NOT NULL, PRIMARY KEY(`key`))",
                )
            }
        }

        val MIGRATIONS = arrayOf(
            MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9,
        )
    }
}
