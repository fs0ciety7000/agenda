package be.agendagn.app.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import be.agendagn.app.data.local.AgendaDatabase
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Mise à jour de l'app : le cache et les actions hors ligne pas encore envoyées sont conservés. */
@RunWith(AndroidJUnit4::class)
class MigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), AgendaDatabase::class.java)

    @Test
    fun `v1 vers v2 - occurrences et outbox conservees, liste vide par defaut`() {
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
        helper.runMigrationsAndValidate(DB, 2, true, *AgendaDatabase.MIGRATIONS).use { db ->
            db.query("SELECT title, checklist FROM occurrences WHERE id = 'o1'").use { c ->
                c.moveToFirst()
                assertEquals("Courses", c.getString(0))
                assertEquals("[]", c.getString(1))
            }
            db.query("SELECT COUNT(*) FROM pending_operations").use { c ->
                c.moveToFirst()
                assertEquals(1, c.getInt(0))
            }
        }
    }

    private companion object {
        const val DB = "migration-test.db"
    }
}
