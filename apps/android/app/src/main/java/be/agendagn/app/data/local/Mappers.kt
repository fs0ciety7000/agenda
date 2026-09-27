package be.agendagn.app.data.local

import be.agendagn.app.data.remote.AttachmentDto
import be.agendagn.app.data.remote.CategoryDto
import be.agendagn.app.data.remote.ChecklistItemDto
import be.agendagn.app.data.remote.ShoppingItemDto
import be.agendagn.app.domain.model.ShoppingItem
import be.agendagn.app.data.remote.json
import be.agendagn.app.domain.model.ChecklistItem
import be.agendagn.app.data.remote.MemberDto
import be.agendagn.app.data.remote.OccurrenceDto
import be.agendagn.app.domain.model.Attachment
import be.agendagn.app.domain.model.CalendarSync
import be.agendagn.app.domain.model.Category
import be.agendagn.app.domain.model.LastDone
import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.MemberColor
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.domain.model.Priority
import be.agendagn.app.domain.model.Visibility
import java.time.Instant
import java.time.LocalDate

private inline fun <reified E : Enum<E>> enumOr(value: String?, fallback: E): E =
    value?.let { v -> enumValues<E>().firstOrNull { it.name == v.uppercase() } } ?: fallback

fun OccurrenceDto.toEntity(householdId: String) = OccurrenceEntity(
    id = id,
    householdId = householdId,
    taskId = taskId,
    title = title,
    notes = notes,
    categoryId = category?.id,
    categoryName = category?.name,
    categoryEmoji = category?.emoji,
    priority = priority,
    visibility = visibility,
    status = status,
    date = date,
    dueDate = dueDate,
    startMinute = startMinute,
    durationMinutes = durationMinutes,
    assigneeIds = assigneeIds.joinToString(","),
    createdById = createdById,
    isRecurring = isRecurring,
    seriesId = seriesId,
    syncToCalendar = syncToCalendar,
    calendarSync = calendarSync,
    completedAt = completedAt,
    version = version,
    checklist = json.encodeToString(checklist),
    attachments = json.encodeToString(attachments),
    lastDoneAt = lastDone?.at,
    lastDoneById = lastDone?.memberId,
)

fun OccurrenceEntity.toDomain(pending: Boolean) = Occurrence(
    id = id,
    taskId = taskId,
    title = title,
    notes = notes,
    category = categoryId?.let { Category(it, categoryName ?: "", categoryEmoji) },
    priority = enumOr(priority, Priority.NORMAL),
    visibility = enumOr(visibility, Visibility.SHARED),
    status = enumOr(status, OccurrenceStatus.TODO),
    date = date?.let(LocalDate::parse),
    dueDate = dueDate?.let(LocalDate::parse),
    startMinute = startMinute,
    durationMinutes = durationMinutes,
    assigneeIds = assigneeIds.split(',').filter { it.isNotBlank() },
    createdById = createdById,
    isRecurring = isRecurring,
    seriesId = seriesId,
    syncToCalendar = syncToCalendar,
    calendarSync = calendarSync?.let { enumOr<CalendarSync>(it, CalendarSync.PENDING) },
    completedAt = completedAt?.let { runCatching { Instant.parse(it) }.getOrNull() },
    version = version,
    pending = pending || isLocal,
    isLocal = isLocal,
    checklist = runCatching { json.decodeFromString<List<ChecklistItemDto>>(checklist) }.getOrDefault(emptyList())
        .map { ChecklistItem(it.id, it.text, it.done) },
    attachments = runCatching { json.decodeFromString<List<AttachmentDto>>(attachments) }.getOrDefault(emptyList())
        .map { Attachment(it.id, it.filename, it.contentType, it.size) },
    lastDone = lastDoneAt?.let { at -> runCatching { Instant.parse(at) }.getOrNull() }?.let { LastDone(it, lastDoneById) },
)

fun MemberDto.toEntity(householdId: String, position: Int) =
    MemberEntity(id, householdId, userId, displayName, color, position)

fun MemberEntity.toDomain() = Member(id, userId, displayName, enumOr(color, MemberColor.SLATE))

fun CategoryDto.toEntity(householdId: String) = CategoryEntity(id, householdId, name, emoji, position)

fun CategoryEntity.toDomain() = Category(id, name, emoji)

fun ShoppingItemDto.toEntity(householdId: String) =
    ShoppingItemEntity(id, householdId, text, done, doneById, createdAt, doneAt, quantity, aisle)

fun ShoppingItemEntity.toDomain() = ShoppingItem(id, text, done, doneById, quantity, aisle)
