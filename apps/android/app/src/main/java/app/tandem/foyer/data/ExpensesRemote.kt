package app.tandem.foyer.data

import app.tandem.foyer.data.files.AttachmentFiles
import app.tandem.foyer.data.local.AgendaDatabase
import app.tandem.foyer.data.remote.AgendaApi
import app.tandem.foyer.data.remote.ExpenseBody
import app.tandem.foyer.data.remote.ExpenseDto
import app.tandem.foyer.data.remote.ExpenseStatsDto
import app.tandem.foyer.data.remote.ExpenseSummaryDto
import app.tandem.foyer.data.remote.RecurringExpenseBody
import app.tandem.foyer.data.remote.RecurringExpenseDto
import app.tandem.foyer.data.remote.SettleBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.IOException
import java.util.UUID

/** Un mois de dépenses : la liste, les totaux et soldes, les charges fixes, l'évolution sur 6 mois. */
data class ExpensesMonth(
    val items: List<ExpenseDto>,
    val summary: ExpenseSummaryDto,
    val recurring: List<RecurringExpenseDto>,
    val stats: ExpenseStatsDto? = null,
)

/**
 * Dépenses du foyer : lues et modifiées en ligne (comme les absences). null / false = hors ligne
 * ou refusé. Les créations portent un identifiant choisi ici : un renvoi ne fait pas de doublon.
 */
class ExpensesRemote(
    private val api: AgendaApi,
    private val db: AgendaDatabase,
    private val cacheDir: File,
) {
    suspend fun month(month: String): ExpensesMonth? = call { h ->
        val list = api.expenses(h, month).body() ?: return@call null
        val summary = api.expenseSummary(h, month).body() ?: return@call null
        val recurring = api.recurringExpenses(h).body() ?: emptyList()
        ExpensesMonth(list, summary, recurring, api.expenseStats(h, month).body())
    }

    /** Enregistre la dépense ; renvoie la dépense enregistrée (pour y joindre un ticket). */
    suspend fun save(editingId: String?, body: ExpenseBody): ExpenseDto? = call { h ->
        val response = if (editingId != null) {
            api.updateExpense(h, editingId, body)
        } else {
            api.createExpense(h, body.copy(id = body.id ?: UUID.randomUUID().toString()))
        }
        response.body().takeIf { response.isSuccessful }
    }

    suspend fun createRecurring(body: RecurringExpenseBody): Boolean =
        call { h -> api.createRecurringExpense(h, body).isSuccessful.takeIf { it } } ?: false

    suspend fun stopRecurring(id: String): Boolean =
        call { h -> api.stopRecurringExpense(h, id).isSuccessful.takeIf { it } } ?: false

    suspend fun settle(from: String, to: String, amountCents: Long): Boolean = call { h ->
        api.settleExpenses(h, SettleBody(UUID.randomUUID().toString(), from, to, amountCents)).isSuccessful.takeIf { it }
    } ?: false

    suspend fun delete(id: String): Boolean = call { h -> api.deleteExpense(h, id).isSuccessful.takeIf { it } } ?: false

    /** Joint un ticket (photo ou PDF, 10 Mo au plus). */
    suspend fun uploadReceipt(expenseId: String, filename: String, contentType: String, bytes: ByteArray): Boolean {
        if (bytes.size > AttachmentFiles.MAX_BYTES) return false
        return call { h ->
            val part = MultipartBody.Part.createFormData(
                "file",
                AttachmentFiles.safeName(filename),
                bytes.toRequestBody(contentType.toMediaTypeOrNull()),
            )
            api.uploadReceipt(h, expenseId, part).isSuccessful.takeIf { it }
        } ?: false
    }

    /** Ticket téléchargé dans le cache (partagé ensuite en lecture seule), et son type. */
    suspend fun downloadReceipt(expenseId: String): Pair<File, String>? = call { h ->
        val res = api.receipt(h, expenseId)
        val body = res.body() ?: return@call null
        if (!res.isSuccessful) return@call null
        val type = body.contentType()?.toString()?.substringBefore(';') ?: "application/octet-stream"
        val dir = File(cacheDir, "attachments/receipt-$expenseId").apply { mkdirs() }
        val file = File(dir, if (type == "application/pdf") "ticket.pdf" else "ticket")
        body.byteStream().use { input -> file.outputStream().use { input.copyTo(it) } }
        file to type
    }

    /** Budget mensuel commun en centimes ; null l'enlève. */
    suspend fun setBudget(cents: Long?): Boolean = call { h ->
        val body = buildJsonObject { put("budgetCents", cents?.let { JsonPrimitive(it) } ?: JsonNull) }
        api.setExpenseBudget(h, body).isSuccessful.takeIf { it }
    } ?: false

    /** Export CSV téléchargé dans le cache (partagé ensuite vers Drive, Sheets, un e-mail…). */
    suspend fun exportCsv(from: String, to: String): File? = call { h ->
        val res = api.exportExpenses(h, from, to)
        val body = res.body() ?: return@call null
        if (!res.isSuccessful) return@call null
        val name = res.headers()["content-disposition"]
            ?.let { Regex("filename=\"([^\"]+)\"").find(it)?.groupValues?.get(1) }
            ?.let(AttachmentFiles::safeName)
            ?: "tandem-$from-$to.csv"
        val dir = File(cacheDir, "attachments/exports").apply { mkdirs() }
        val file = File(dir, name)
        body.byteStream().use { input -> file.outputStream().use { input.copyTo(it) } }
        file
    }

    suspend fun deleteReceipt(expenseId: String): Boolean =
        call { h -> api.deleteReceipt(h, expenseId).isSuccessful.takeIf { it } } ?: false

    private suspend fun <T> call(block: suspend (householdId: String) -> T?): T? = withContext(Dispatchers.IO) {
        val h = db.households().current() ?: return@withContext null
        try {
            block(h.id)
        } catch (_: IOException) {
            null
        }
    }
}
