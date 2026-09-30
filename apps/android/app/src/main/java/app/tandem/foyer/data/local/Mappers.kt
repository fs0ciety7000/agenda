package app.tandem.foyer.data.local

import app.tandem.foyer.data.remote.AttachmentDto
import app.tandem.foyer.data.remote.CategoryDto
import app.tandem.foyer.data.remote.ChecklistItemDto
import app.tandem.foyer.data.remote.ShoppingItemDto
import app.tandem.foyer.domain.model.ShoppingItem
import app.tandem.foyer.data.remote.json
import app.tandem.foyer.domain.model.ChecklistItem
import app.tandem.foyer.data.remote.MemberDto
import app.tandem.foyer.data.remote.OccurrenceDto
import app.tandem.foyer.domain.model.Attachment
import app.tandem.foyer.domain.model.CalendarSync
import app.tandem.foyer.domain.model.Category
import app.tandem.foyer.domain.model.LastDone
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.domain.model.MemberColor
import app.tandem.foyer.domain.model.Occurrence
import app.tandem.foyer.domain.model.OccurrenceStatus
import app.tandem.foyer.domain.model.Priority
import app.tandem.foyer.domain.model.Visibility
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
    completedById = completedById,
    thankedBy = thankedBy.joinToString(","),
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
    completedById = completedById,
    thankedBy = thankedBy.split(',').filter { it.isNotBlank() },
)

fun MemberDto.toEntity(householdId: String, position: Int) =
    MemberEntity(id, householdId, userId, displayName, color, position)

fun MemberEntity.toDomain() = Member(id, userId, displayName, enumOr(color, MemberColor.SLATE))

fun CategoryDto.toEntity(householdId: String) = CategoryEntity(id, householdId, name, emoji, position)

fun CategoryEntity.toDomain() = Category(id, name, emoji)

fun ShoppingItemDto.toEntity(householdId: String) =
    ShoppingItemEntity(id, householdId, text, done, doneById, createdAt, doneAt, quantity, aisle)

fun ShoppingItemEntity.toDomain() = ShoppingItem(id, text, done, doneById, quantity, aisle)
