package be.agendagn.app.domain

import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.TaskDraft
import be.agendagn.app.domain.model.Visibility
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Corps JSON des requêtes, conformes à `packages/contracts` (CreateTaskInput, UpdateOccurrenceInput). */
object TaskPayloads {
    private fun ids(list: List<String>) = JsonArray(list.map(::JsonPrimitive))

    private fun String?.orNullJson() = this?.let(::JsonPrimitive) ?: JsonNull

    private fun Int?.orNullJson() = this?.let(::JsonPrimitive) ?: JsonNull

    fun create(draft: TaskDraft, myMemberId: String?, members: List<Member>): JsonObject {
        val personal = draft.personal
        val assignees = if (personal) listOfNotNull(myMemberId) else draft.assigneeIds
        return buildJsonObject {
            put("title", draft.title.trim())
            draft.notes.trim().takeIf { it.isNotEmpty() }?.let { put("notes", it) }
            draft.categoryId?.let { put("categoryId", it) }
            put("priority", draft.priority.name)
            put("visibility", if (personal) Visibility.PERSONAL.name else Visibility.SHARED.name)
            put("assigneeIds", ids(assignees))
            draft.date?.let { put("date", it.toString()) }
            if (draft.date == null) draft.dueDate?.let { put("dueDate", it.toString()) }
            if (draft.date != null) {
                draft.startMinute?.let { put("startMinute", it) }
                if (draft.startMinute != null) draft.durationMinutes?.let { put("durationMinutes", it) }
            }
            put("syncToCalendar", !personal && draft.date != null && draft.syncToCalendar)
            Recurrences.toJson(draft.recurrence, draft.date, assignees, members, personal)?.let { put("recurrence", it) }
            draft.checklist.map { it.trim() }.filter { it.isNotEmpty() }.takeIf { it.isNotEmpty() }?.let {
                put("checklist", JsonArray(it.map(::JsonPrimitive)))
            }
        }
    }

    fun draftOf(o: Occurrence) = TaskDraft(
        title = o.title,
        notes = o.notes.orEmpty(),
        date = o.date,
        dueDate = o.dueDate,
        startMinute = o.startMinute,
        durationMinutes = o.durationMinutes,
        assigneeIds = o.assigneeIds,
        categoryId = o.category?.id,
        priority = o.priority,
        personal = o.visibility == Visibility.PERSONAL,
        syncToCalendar = o.syncToCalendar,
    )

    /**
     * Modification : uniquement les champs changés (une série ne reçoit pas de valeurs non modifiées)
     * + `version` (concurrence optimiste). null = rien à envoyer.
     * [recurrence] : nouvelle répétition à appliquer (tâche ponctuelle rendue récurrente, ou série modifiée).
     */
    fun update(original: Occurrence, draft: TaskDraft, recurrence: JsonObject? = null): JsonObject? {
        val before = draftOf(original)
        val changes = buildJsonObject {
            if (draft.title.trim() != before.title) put("title", draft.title.trim())
            if (draft.notes.trim() != before.notes.trim()) put("notes", draft.notes.trim().ifEmpty { null }.orNullJson())
            if (draft.date != before.date) put("date", draft.date?.toString().orNullJson())
            val due = if (draft.date == null) draft.dueDate else null
            if (due != before.dueDate) put("dueDate", due?.toString().orNullJson())
            val start = if (draft.date == null) null else draft.startMinute
            if (start != before.startMinute) put("startMinute", start.orNullJson())
            val duration = if (start == null) null else draft.durationMinutes
            if (duration != before.durationMinutes) put("durationMinutes", duration.orNullJson())
            if (draft.assigneeIds.toSet() != before.assigneeIds.toSet() && !draft.personal) {
                put("assigneeIds", ids(draft.assigneeIds))
            }
            if (draft.categoryId != before.categoryId) put("categoryId", draft.categoryId.orNullJson())
            if (draft.priority != before.priority) put("priority", draft.priority.name)
            if (draft.personal != before.personal) {
                put("visibility", if (draft.personal) Visibility.PERSONAL.name else Visibility.SHARED.name)
            }
            val sync = !draft.personal && draft.date != null && draft.syncToCalendar
            if (sync != before.syncToCalendar) put("syncToCalendar", sync)
            recurrence?.let { put("recurrence", it) }
        }
        if (changes.isEmpty()) return null
        return JsonObject(changes + ("version" to JsonPrimitive(original.version)))
    }
}
