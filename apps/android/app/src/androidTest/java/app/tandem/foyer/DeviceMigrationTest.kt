package app.tandem.foyer

import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.tandem.foyer.data.local.AgendaDatabase
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sur un vrai Android (SQLite de l'appareil, pas celui de Robolectric) : une app installée en v1
 * passe toutes les migrations jusqu'à la version courante sans perdre le cache ni les actions
 * hors ligne pas encore envoyées, puis s'ouvre normalement avec Room.
 */
@RunWith(AndroidJUnit4::class)
class DeviceMigrationTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    @get:Rule
    val helper = MigrationTestHelper(instrumentation, AgendaDatabase::class.java)

    @Test
    fun v1VersDerniereVersion() = runTest {
        helper.createDatabase(DB, 1).use { db ->
            db.execSQL(
                """INSERT INTO occurrences (id, householdId, taskId, title, priority, visibility, status, date,
                assigneeIds, createdById, isRecurring, syncToCalendar, version, isLocal)
                VALUES ('o1', 'h1', 't1', 'Courses', 'NORMAL', 'SHARED', 'TODO', '2026-09-29', 'm1', 'm1', 0, 0, 1, 0)""",
            )
            db.execSQL(
                """INSERT INTO pending_operations (householdId, type, occurrenceId, payload, idempotencyKey, createdAt, attempts)
                VALUES ('h1', 'COMPLETE', 'o1', NULL, 'k1', 0, 0)""",
            )
        }
        val latest = AgendaDatabase.MIGRATIONS.maxOf { it.endVersion }
        helper.runMigrationsAndValidate(DB, latest, true, *AgendaDatabase.MIGRATIONS).close()

        val context = instrumentation.targetContext
        val db = Room.databaseBuilder(context, AgendaDatabase::class.java, DB)
            .addMigrations(*AgendaDatabase.MIGRATIONS)
            .build()
        try {
            assertEquals(1, db.pendingOperations().all().size)
            assertEquals(emptyList<Any>(), db.shopping().observe("h1").first())
        } finally {
            db.close()
            context.deleteDatabase(DB)
        }
    }

    private companion object {
        const val DB = "device-migration-test.db"
    }
}
