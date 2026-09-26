package be.agendagn.app.data.sync

import be.agendagn.app.data.SettingsStore
import be.agendagn.app.data.local.AgendaDatabase
import be.agendagn.app.data.local.HouseholdEntity
import be.agendagn.app.data.local.PendingOperationEntity
import be.agendagn.app.data.local.PendingOperationEntity.Companion.COMPLETE
import be.agendagn.app.data.local.PendingOperationEntity.Companion.CREATE
import be.agendagn.app.data.local.PendingOperationEntity.Companion.QUICK_ADD
import be.agendagn.app.data.local.PendingOperationEntity.Companion.REOPEN
import be.agendagn.app.data.local.toEntity
import be.agendagn.app.data.remote.AgendaApi
import be.agendagn.app.data.remote.ApiErrorDto
import be.agendagn.app.data.remote.OccurrenceDto
import be.agendagn.app.data.remote.QuickAddRequest
import be.agendagn.app.data.remote.json
import be.agendagn.app.domain.repository.RefreshOutcome
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Synchronisation avec l'API (ADR-007) :
 * 1. rejoue l'outbox dans l'ordre (cocher / décocher idempotents, créations avec Idempotency-Key) ;
 * 2. recharge le cache (foyer, catégories, occurrences de J−30 à J+60 + retards + sans date),
 *    puis ré-applique les actions encore en attente pour que l'affichage reste celui de l'utilisateur.
 */
class SyncEngine(
    private val api: AgendaApi,
    private val db: AgendaDatabase,
    private val settings: SettingsStore,
    private val clock: Clock = Clock.systemUTC(),
) {
    enum class PushOutcome { DONE, RETRY, SIGNED_OUT }

    data class PushResult(val outcome: PushOutcome, val rejected: Int)

    private companion object {
        /** Au-delà (erreur serveur persistante), l'action est abandonnée plutôt que bloquer la file. */
        const val MAX_ATTEMPTS = 10
    }

    /** Un seul envoi / rechargement à la fois (WorkManager et rafraîchissement manuel). */
    private val mutex = Mutex()

    /** Envoi seul (tests) ; en production, [refresh] vérifie d'abord le compte. */
    internal suspend fun pushPending(): PushResult = mutex.withLock { push() }

    suspend fun refresh(): RefreshOutcome = mutex.withLock {
        // Le compte est vérifié AVANT d'envoyer l'outbox : les actions d'un autre compte
        // (session expirée puis connexion de quelqu'un d'autre) ne partent jamais.
        val user = try {
            val me = api.me()
            if (me.code() == 401) return RefreshOutcome.SIGNED_OUT
            me.body() ?: return RefreshOutcome.ERROR
        } catch (_: IOException) {
            return RefreshOutcome.OFFLINE
        } catch (_: SerializationException) {
            return RefreshOutcome.ERROR // réponse inattendue (proxy, page d'erreur) : on réessaiera
        }
        if (settings.cacheOwner() != user.id) {
            db.clearAllTables()
            settings.setCacheOwner(user.id)
        }
        when (push().outcome) {
            PushOutcome.SIGNED_OUT -> return RefreshOutcome.SIGNED_OUT
            else -> Unit // RETRY : on recharge quand même ce qui peut l'être.
        }
        pull(user.id)
    }

    private suspend fun push(): PushResult {
        val ops = db.pendingOperations()
        val occurrences = db.occurrences()
        var rejected = 0
        while (true) {
            val op = ops.next() ?: return PushResult(PushOutcome.DONE, rejected)
            val response = try {
                send(op)
            } catch (_: IOException) {
                return PushResult(PushOutcome.RETRY, rejected)
            } catch (_: SerializationException) {
                ops.incrementAttempts(op.id)
                return PushResult(PushOutcome.RETRY, rejected)
            }
            val code = response.code()
            when {
                response.isSuccessful -> {
                    val body = response.body()
                    if (op.type == CREATE || op.type == QUICK_ADD) {
                        occurrences.delete(op.occurrenceId)
                        if (body != null) ops.remap(op.occurrenceId, body.id)
                    }
                    // Une action plus récente sur la même occurrence reste à envoyer : on garde l'état local.
                    if (body != null && ops.all().none { it.id != op.id && it.occurrenceId == body.id }) {
                        occurrences.upsert(body.toEntity(op.householdId))
                    }
                    ops.delete(op.id)
                }
                code == 401 -> return PushResult(PushOutcome.SIGNED_OUT, rejected)
                (code == 429 || code >= 500 || errorCode(response) == "IDEMPOTENCY_IN_PROGRESS") &&
                    op.attempts < MAX_ATTEMPTS -> {
                    ops.incrementAttempts(op.id)
                    return PushResult(PushOutcome.RETRY, rejected)
                }
                else -> {
                    // Refus définitif (tâche supprimée ailleurs, donnée invalide) : on abandonne l'action.
                    rejected++
                    ops.delete(op.id)
                    if (op.type == CREATE || op.type == QUICK_ADD || code == 404) {
                        occurrences.delete(op.occurrenceId)
                    }
                }
            }
        }
    }

    private suspend fun send(op: PendingOperationEntity): Response<OccurrenceDto> = when (op.type) {
        COMPLETE -> api.complete(op.householdId, op.occurrenceId)
        REOPEN -> api.reopen(op.householdId, op.occurrenceId)
        CREATE -> api.createTask(
            op.householdId,
            op.idempotencyKey,
            json.decodeFromString(JsonObject.serializer(), op.payload!!),
        )
        QUICK_ADD -> api.quickAdd(op.householdId, op.idempotencyKey, QuickAddRequest(op.payload!!))
        else -> error("Unknown operation ${op.type}")
    }

    private fun errorCode(response: Response<*>): String? = runCatching {
        json.decodeFromString<ApiErrorDto>(response.errorBody()!!.string()).error.code
    }.getOrNull()

    private suspend fun pull(userId: String): RefreshOutcome {
        try {
            val households = api.households().body() ?: return RefreshOutcome.ERROR
            val household = households.firstOrNull() ?: run {
                db.households().clearHouseholds()
                return RefreshOutcome.NO_HOUSEHOLD
            }
            val hid = household.id
            val today = LocalDate.now(clock.withZone(ZoneId.of(household.timezone)))
            val categories = api.categories(hid).body() ?: return RefreshOutcome.ERROR
            val window = api.occurrences(hid, "all", today.minusDays(30).toString(), today.plusDays(60).toString())
            val overdue = api.occurrences(hid, "overdue")
            val unscheduled = api.occurrences(hid, "unscheduled")
            if (!window.isSuccessful || !overdue.isSuccessful || !unscheduled.isSuccessful) return RefreshOutcome.ERROR
            val rows = (window.body()!! + overdue.body()!! + unscheduled.body()!!)
                .distinctBy { it.id }
                .map { it.toEntity(hid) }

            db.households().replace(
                HouseholdEntity(hid, household.name, household.timezone, household.members.firstOrNull { it.userId == userId }?.id),
                household.members.mapIndexed { i, m -> m.toEntity(hid, i) },
                categories.map { it.toEntity(hid) },
            )
            db.occurrences().replaceServerRows(hid, rows)
            reapplyPending()
            settings.setLastRefreshAt(Instant.now(clock).toEpochMilli())
            return RefreshOutcome.OK
        } catch (_: IOException) {
            return RefreshOutcome.OFFLINE
        } catch (_: SerializationException) {
            return RefreshOutcome.ERROR
        }
    }

    /** Les coches non encore envoyées l'emportent sur la copie serveur (« la complétion gagne »). */
    private suspend fun reapplyPending() {
        for (op in db.pendingOperations().all()) {
            when (op.type) {
                COMPLETE -> db.occurrences().setStatus(op.occurrenceId, "DONE", Instant.ofEpochMilli(op.createdAt).toString())
                REOPEN -> db.occurrences().setStatus(op.occurrenceId, "TODO", null)
            }
        }
    }
}
