package app.tandem.foyer.data

import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.ExpenseBody
import app.tandem.foyer.data.remote.ExpenseDto
import app.tandem.foyer.data.remote.ExpenseSummaryDto
import app.tandem.foyer.data.remote.SettleBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.UUID

/**
 * Dépenses du foyer : lues et modifiées en ligne (comme les absences). null / false = hors ligne
 * ou refusé. Les créations portent un identifiant choisi ici : un renvoi ne fait pas de doublon.
 */
class ExpensesRemote(private val api: AgendaApi, private val db: AgendaDatabase) {
    suspend fun month(month: String): Pair<List<ExpenseDto>, ExpenseSummaryDto>? = call { h ->
        val list = api.expenses(h, month).body() ?: return@call null
        val summary = api.expenseSummary(h, month).body() ?: return@call null
        list to summary
    }

    suspend fun save(editingId: String?, body: ExpenseBody): Boolean = call { h ->
        val response = if (editingId != null) {
            api.updateExpense(h, editingId, body)
        } else {
            api.createExpense(h, body.copy(id = body.id ?: UUID.randomUUID().toString()))
        }
        response.isSuccessful.takeIf { it }
    } ?: false

    suspend fun settle(from: String, to: String, amountCents: Long): Boolean = call { h ->
        api.settleExpenses(h, SettleBody(UUID.randomUUID().toString(), from, to, amountCents)).isSuccessful.takeIf { it }
    } ?: false

    suspend fun delete(id: String): Boolean = call { h -> api.deleteExpense(h, id).isSuccessful.takeIf { it } } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }
}
