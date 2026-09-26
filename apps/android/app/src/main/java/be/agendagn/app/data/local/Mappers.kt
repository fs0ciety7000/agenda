package be.agendagn.app.data.local

import be.agendagn.app.data.remote.CategoryDto
import be.agendagn.app.data.remote.ChecklistItemDto
import be.agendagn.app.data.remote.json
import be.agendagn.app.domain.model.ChecklistItem
import be.agendagn.app.data.remote.MemberDto
import be.agendagn.app.data.remote.OccurrenceDto
import be.agendagn.app.domain.model.CalendarSync
import be.agendagn.app.domain.model.Category
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
    startMinute = startMinute,
    durationMinutes = durationMinutes,
    assigneeIds = assigneeIds.split(',').filter { it.isNotBlank() },
    createdById = createdById,
    isRecurring = isRecurring,
    syncToCalendar = syncToCalendar,
    calendarSync = calendarSync?.let { enumOr<CalendarSync>(it, CalendarSync.PENDING) },
    completedAt = completedAt?.let { runCatching { Instant.parse(it) }.getOrNull() },
    version = version,
    pending = pending || isLocal,
    isLocal = isLocal,
    checklist = runCatching { json.decodeFromString<List<ChecklistItemDto>>(checklist) }.getOrDefault(emptyList())
        .map { ChecklistItem(it.id, it.text, it.done) },
)

fun MemberDto.toEntity(householdId: String, position: Int) =
    MemberEntity(id, householdId, userId, displayName, color, position)

fun MemberEntity.toDomain() = Member(id, userId, displayName, enumOr(color, MemberColor.SLATE))

fun CategoryDto.toEntity(householdId: String) = CategoryEntity(id, householdId, name, emoji, position)

fun CategoryEntity.toDomain() = Category(id, name, emoji)
