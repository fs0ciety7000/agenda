package be.agendagn.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        HouseholdEntity::class,
        MemberEntity::class,
        CategoryEntity::class,
        OccurrenceEntity::class,
        PendingOperationEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class AgendaDatabase : RoomDatabase() {
    abstract fun households(): HouseholdDao
    abstract fun occurrences(): OccurrenceDao
    abstract fun pendingOperations(): PendingOperationDao

    companion object {
        fun create(context: Context): AgendaDatabase =
            Room.databaseBuilder(context, AgendaDatabase::class.java, "agenda.db")
                // Simple cache : en cas de changement de schéma, on le reconstruit depuis le serveur.
                // Les actions hors ligne non envoyées seraient perdues : les migrations deviendront
                // nécessaires dès que le schéma évoluera en production (voir docs/android.md).
                .fallbackToDestructiveMigration(dropAllTables = true)
                .build()
    }
}
