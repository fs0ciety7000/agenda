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
    ],
    version = 2,
    exportSchema = true,
)
abstract class AgendaDatabase : RoomDatabase() {
    abstract fun households(): HouseholdDao
    abstract fun occurrences(): OccurrenceDao
    abstract fun pendingOperations(): PendingOperationDao

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

        val MIGRATIONS = arrayOf(MIGRATION_1_2)
    }
}
