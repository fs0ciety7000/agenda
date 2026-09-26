import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BalanceDto,
  BalanceQuery,
  CreateTaskInput,
  OccurrenceDto,
  OccurrenceQuery,
  QuickAddPreview,
  UpdateOccurrenceInput,
} from '@agenda/contracts';
import { addDays, parseQuickAdd, startOfWeek, todayIn, zonedToUtc } from '@agenda/domain';
import { AppException, notFound } from '../common/app-exception';
import { fromDbDate, toDbDate } from '../common/dates';
import { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const occurrenceInclude = {
  task: { include: { category: true } },
  assignees: { select: { memberId: true } },
} satisfies Prisma.TaskOccurrenceInclude;

type OccurrenceRow = Prisma.TaskOccurrenceGetPayload<{ include: typeof occurrenceInclude }>;
type Tx = Prisma.TransactionClient;

interface Schedule {
  date: string | null;
  startMinute: number | null;
  durationMinutes: number | null;
}

const validation = (field: string, message: string) =>
  new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, message, {
    fieldErrors: { [field]: [message] },
  });

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── Lecture ─────────────

  /**
   * Une tâche personnelle n'est visible que par son créateur ; une tâche supprimée n'est visible
   * par personne. Toute lecture ou écriture passe par ce filtre (isolation foyer + vie privée).
   */
  private visible(ctx: HouseholdContext): Prisma.TaskOccurrenceWhereInput {
    return {
      householdId: ctx.householdId,
      task: { deletedAt: null, OR: [{ visibility: 'SHARED' }, { createdById: ctx.memberId }] },
    };
  }

  async list(ctx: HouseholdContext, query: OccurrenceQuery): Promise<OccurrenceDto[]> {
    const today = todayIn(await this.timezone(ctx));
    const and: Prisma.TaskOccurrenceWhereInput[] = [this.visible(ctx)];

    switch (query.view) {
      case 'today':
        and.push({ date: toDbDate(today), status: { not: 'CANCELLED' } });
        break;
      case 'upcoming':
        and.push({ date: { gt: toDbDate(today) }, status: 'TODO' });
        break;
      case 'overdue':
        and.push({ date: { lt: toDbDate(today) }, status: 'TODO' });
        break;
      case 'unscheduled':
        and.push({ date: null, status: 'TODO' });
        break;
      case 'done':
        and.push({ status: 'DONE' });
        break;
      case 'all':
        and.push({ status: { not: 'CANCELLED' } });
        break;
    }
    if (query.from) and.push({ date: { gte: toDbDate(query.from) } });
    if (query.to) and.push({ date: { lte: toDbDate(query.to) } });
    if (query.status) and.push({ status: query.status });
    if (query.priority) and.push({ task: { priority: query.priority } });
    if (query.visibility) and.push({ task: { visibility: query.visibility } });
    if (query.categoryId) and.push({ task: { categoryId: query.categoryId } });
    if (query.q) {
      and.push({
        task: {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { notes: { contains: query.q, mode: 'insensitive' } },
          ],
        },
      });
    }
    if (query.assignee === 'me') and.push({ assignees: { some: { memberId: ctx.memberId } } });
    else if (query.assignee === 'unassigned') and.push({ assignees: { none: {} } });
    else if (query.assignee === 'together')
      and.push({ id: { in: await this.sharedOccurrenceIds(ctx) } });
    else if (query.assignee) and.push({ assignees: { some: { memberId: query.assignee } } });

    const rows = await this.prisma.taskOccurrence.findMany({
      where: { AND: and },
      include: occurrenceInclude,
      orderBy:
        query.view === 'done'
          ? [{ completedAt: 'desc' }]
          : [
              { date: { sort: 'asc', nulls: 'last' } },
              { startMinute: { sort: 'asc', nulls: 'last' } },
              { createdAt: 'asc' },
            ],
      take: query.limit,
    });
    return rows.map(toDto);
  }

  async get(ctx: HouseholdContext, id: string): Promise<OccurrenceDto> {
    return toDto(await this.findVisible(ctx, id));
  }

  /** Occurrences qui ont au moins deux responsables (« à deux »). */
  private async sharedOccurrenceIds(ctx: HouseholdContext): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT a."occurrenceId" AS id
      FROM "OccurrenceAssignee" a
      JOIN "TaskOccurrence" o ON o.id = a."occurrenceId"
      WHERE o."householdId" = ${ctx.householdId}::uuid
      GROUP BY a."occurrenceId"
      HAVING count(*) > 1`;
    return rows.map((r) => r.id);
  }

  // ───────────── Création ─────────────

  async create(ctx: HouseholdContext, input: CreateTaskInput): Promise<OccurrenceDto> {
    const tz = await this.timezone(ctx);
    const personal = input.visibility === 'PERSONAL';
    const assigneeIds = personal ? [ctx.memberId] : input.assigneeIds;
    await this.validateRefs(ctx, input.categoryId ?? null, assigneeIds);

    const schedule: Schedule = {
      date: input.date ?? null,
      startMinute: input.startMinute ?? null,
      durationMinutes: input.durationMinutes ?? null,
    };

    const occurrenceId = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          householdId: ctx.householdId,
          createdById: ctx.memberId,
          title: input.title,
          notes: input.notes ?? null,
          categoryId: input.categoryId ?? null,
          priority: input.priority,
          visibility: input.visibility,
          occurrences: {
            create: {
              householdId: ctx.householdId,
              ...scheduleColumns(schedule, tz),
              assignees: { create: dedupe(assigneeIds).map((memberId) => ({ memberId })) },
            },
          },
        },
        include: { occurrences: { select: { id: true } } },
      });
      await this.log(tx, ctx, 'task.created', 'Task', task.id);
      return task.occurrences[0]!.id;
    });
    return this.get(ctx, occurrenceId);
  }

  async previewQuickAdd(ctx: HouseholdContext, text: string): Promise<QuickAddPreview> {
    const [household, members, categories] = await Promise.all([
      this.prisma.household.findUniqueOrThrow({
        where: { id: ctx.householdId },
        select: { timezone: true },
      }),
      this.prisma.householdMember.findMany({
        where: { householdId: ctx.householdId, leftAt: null },
        select: { id: true, displayName: true },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.category.findMany({
        where: { householdId: ctx.householdId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { position: 'asc' },
      }),
    ]);
    return parseQuickAdd(text, { today: todayIn(household.timezone), members, categories });
  }

  /** Quick add : l'analyse est faite côté serveur (même comportement web et Android). */
  async quickAdd(ctx: HouseholdContext, text: string): Promise<OccurrenceDto> {
    const parsed = await this.previewQuickAdd(ctx, text);
    if (!parsed.title) {
      throw new AppException(
        'TASK_TITLE_REQUIRED',
        HttpStatus.BAD_REQUEST,
        'Nothing left for the title',
      );
    }
    return this.create(ctx, {
      title: parsed.title.slice(0, 200),
      priority: parsed.priority ?? 'NORMAL',
      visibility: 'SHARED',
      assigneeIds: parsed.assigneeIds ?? [],
      categoryId: parsed.categoryId,
      date: parsed.date,
      startMinute: parsed.startMinute,
      durationMinutes: parsed.durationMinutes,
    });
  }

  // ───────────── Modification ─────────────

  async update(
    ctx: HouseholdContext,
    id: string,
    input: UpdateOccurrenceInput,
  ): Promise<OccurrenceDto> {
    const current = await this.findVisible(ctx, id);
    const task = current.task;

    const visibility = input.visibility ?? task.visibility;
    if (visibility !== task.visibility && task.createdById !== ctx.memberId) {
      // Seul le créateur peut rendre une tâche personnelle (ou la partager).
      throw new AppException(
        'FORBIDDEN',
        HttpStatus.FORBIDDEN,
        'Only the creator can change visibility',
      );
    }
    const assigneeIds =
      visibility === 'PERSONAL'
        ? [task.createdById]
        : (input.assigneeIds ??
          (task.visibility === 'PERSONAL' ? [] : current.assignees.map((a) => a.memberId)));
    await this.validateRefs(
      ctx,
      input.categoryId === undefined ? null : input.categoryId,
      assigneeIds,
    );

    const schedule: Schedule = {
      date: input.date !== undefined ? input.date : fromDbDate(current.date),
      startMinute: input.startMinute !== undefined ? input.startMinute : current.startMinute,
      durationMinutes:
        input.durationMinutes !== undefined ? input.durationMinutes : current.durationMinutes,
    };
    // Retirer la date retire aussi l'heure.
    if (schedule.date === null) schedule.startMinute = null;
    if (input.startMinute != null && schedule.date === null) {
      throw validation('startMinute', 'startMinute requires date');
    }
    const tz = await this.timezone(ctx);

    await this.prisma.$transaction(async (tx) => {
      // Concurrence optimiste : échoue si quelqu'un a modifié l'occurrence entre-temps.
      const { count } = await tx.taskOccurrence.updateMany({
        where: { id, version: input.version },
        data: {
          ...scheduleColumns(schedule, tz),
          version: { increment: 1 },
          syncVersion: { increment: 1 },
        },
      });
      if (count !== 1) throw this.conflict(current);

      await tx.task.update({
        where: { id: task.id },
        data: {
          title: input.title,
          notes: input.notes,
          categoryId: input.categoryId,
          priority: input.priority,
          visibility,
          syncToCalendar: visibility === 'PERSONAL' ? false : undefined,
          version: { increment: 1 },
        },
      });
      await tx.occurrenceAssignee.deleteMany({ where: { occurrenceId: id } });
      await tx.occurrenceAssignee.createMany({
        data: dedupe(assigneeIds).map((memberId) => ({ occurrenceId: id, memberId })),
      });
      await this.log(tx, ctx, 'occurrence.updated', 'TaskOccurrence', id, changedFields(input));
    });
    return this.get(ctx, id);
  }

  /** Idempotent : cocher une tâche déjà faite ne change rien (rejeu offline sans effet). */
  async complete(ctx: HouseholdContext, id: string): Promise<OccurrenceDto> {
    const current = await this.findVisible(ctx, id);
    if (current.status !== 'DONE') {
      await this.prisma.$transaction(async (tx) => {
        await tx.taskOccurrence.update({
          where: { id },
          data: {
            status: 'DONE',
            completedAt: new Date(),
            completedById: ctx.memberId,
            version: { increment: 1 },
            syncVersion: { increment: 1 },
          },
        });
        await this.log(tx, ctx, 'occurrence.completed', 'TaskOccurrence', id);
      });
    }
    return this.get(ctx, id);
  }

  async reopen(ctx: HouseholdContext, id: string): Promise<OccurrenceDto> {
    const current = await this.findVisible(ctx, id);
    if (current.status === 'DONE') {
      await this.prisma.$transaction(async (tx) => {
        await tx.taskOccurrence.update({
          where: { id },
          data: {
            status: 'TODO',
            completedAt: null,
            completedById: null,
            version: { increment: 1 },
            syncVersion: { increment: 1 },
          },
        });
        await this.log(tx, ctx, 'occurrence.reopened', 'TaskOccurrence', id);
      });
    }
    return this.get(ctx, id);
  }

  /** Tâche ponctuelle : suppression douce de la tâche (purge RGPD après 30 jours). */
  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    const current = await this.findVisible(ctx, id);
    if (current.seriesId) {
      // Les séries (Phase 3) exigent de choisir la portée : cette occurrence / les suivantes / toutes.
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        'Recurring task: scope required',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: current.taskId }, data: { deletedAt: new Date() } });
      await this.log(tx, ctx, 'task.deleted', 'Task', current.taskId);
    });
  }

  // ───────────── Répartition ─────────────

  /** Répartition factuelle des tâches partagées sur une période (semaine courante par défaut). */
  async balance(ctx: HouseholdContext, query: BalanceQuery): Promise<BalanceDto> {
    const today = todayIn(await this.timezone(ctx));
    const from = query.from ?? startOfWeek(today);
    const to = query.to ?? addDays(from, 6);
    const [members, rows] = await Promise.all([
      this.prisma.householdMember.findMany({
        where: { householdId: ctx.householdId, leftAt: null },
        orderBy: { joinedAt: 'asc' },
        select: { id: true },
      }),
      this.prisma.taskOccurrence.findMany({
        where: {
          householdId: ctx.householdId,
          status: { not: 'CANCELLED' },
          date: { gte: toDbDate(from), lte: toDbDate(to) },
          // Les tâches personnelles ne sont jamais comptées : rien ne fuit vers l'autre membre.
          task: { deletedAt: null, visibility: 'SHARED' },
        },
        select: { durationMinutes: true, assignees: { select: { memberId: true } } },
      }),
    ]);

    const perMember = new Map(members.map((m) => [m.id, { memberId: m.id, count: 0, minutes: 0 }]));
    const together = { count: 0, minutes: 0 };
    const unassigned = { count: 0, minutes: 0 };
    for (const row of rows) {
      const bucket =
        row.assignees.length === 0
          ? unassigned
          : row.assignees.length > 1
            ? together
            : perMember.get(row.assignees[0]!.memberId);
      if (!bucket) continue; // ancien membre
      bucket.count += 1;
      bucket.minutes += row.durationMinutes ?? 0;
    }
    return { from, to, members: [...perMember.values()], together, unassigned };
  }

  // ───────────── Utilitaires ─────────────

  private async findVisible(ctx: HouseholdContext, id: string): Promise<OccurrenceRow> {
    const row = await this.prisma.taskOccurrence.findFirst({
      where: { AND: [{ id }, this.visible(ctx)] },
      include: occurrenceInclude,
    });
    if (!row) throw notFound();
    return row;
  }

  private async timezone(ctx: HouseholdContext): Promise<string> {
    const h = await this.prisma.household.findUniqueOrThrow({
      where: { id: ctx.householdId },
      select: { timezone: true },
    });
    return h.timezone;
  }

  /** Une catégorie ou un responsable d'un autre foyer est refusé (jamais d'id « étranger »). */
  private async validateRefs(
    ctx: HouseholdContext,
    categoryId: string | null,
    assigneeIds: string[],
  ): Promise<void> {
    if (categoryId) {
      const found = await this.prisma.category.count({
        where: { id: categoryId, householdId: ctx.householdId, deletedAt: null },
      });
      if (!found) throw validation('categoryId', 'Unknown category');
    }
    const ids = dedupe(assigneeIds);
    if (ids.length) {
      const found = await this.prisma.householdMember.count({
        where: { id: { in: ids }, householdId: ctx.householdId, leftAt: null },
      });
      if (found !== ids.length) throw validation('assigneeIds', 'Unknown member');
    }
  }

  private conflict(current: OccurrenceRow): AppException {
    return new AppException('VERSION_CONFLICT', HttpStatus.CONFLICT, 'Occurrence was modified', {
      current: toDto(current),
    });
  }

  private log(
    tx: Tx,
    ctx: HouseholdContext,
    action: string,
    entityType: string,
    entityId: string,
    data?: object,
  ) {
    return tx.activityLog.create({
      data: {
        householdId: ctx.householdId,
        actorId: ctx.memberId,
        action,
        entityType,
        entityId,
        data,
      },
    });
  }
}

/** Colonnes dérivées : `startsAt`/`endsAt` en UTC, calculés avec le fuseau du foyer. */
function scheduleColumns(s: Schedule, tz: string) {
  if (!s.date) {
    return {
      date: null,
      startMinute: null,
      durationMinutes: s.durationMinutes,
      allDay: false,
      startsAt: null,
      endsAt: null,
    };
  }
  if (s.startMinute == null) {
    return {
      date: toDbDate(s.date),
      startMinute: null,
      durationMinutes: s.durationMinutes,
      allDay: true,
      startsAt: zonedToUtc(s.date, 0, tz),
      endsAt: zonedToUtc(addDays(s.date, 1), 0, tz),
    };
  }
  const startsAt = zonedToUtc(s.date, s.startMinute, tz);
  return {
    date: toDbDate(s.date),
    startMinute: s.startMinute,
    durationMinutes: s.durationMinutes,
    allDay: false,
    startsAt,
    endsAt: new Date(startsAt.getTime() + (s.durationMinutes ?? 0) * 60_000),
  };
}

function toDto(o: OccurrenceRow): OccurrenceDto {
  return {
    id: o.id,
    taskId: o.taskId,
    title: o.titleOverride ?? o.task.title,
    notes: o.notesOverride ?? o.task.notes,
    category:
      o.task.category && !o.task.category.deletedAt
        ? { id: o.task.category.id, name: o.task.category.name, emoji: o.task.category.emoji }
        : null,
    priority: o.task.priority,
    visibility: o.task.visibility,
    status: o.status,
    date: fromDbDate(o.date),
    startMinute: o.startMinute,
    durationMinutes: o.durationMinutes,
    assigneeIds: o.assignees.map((a) => a.memberId).sort(),
    createdById: o.task.createdById,
    isRecurring: o.seriesId !== null,
    completedAt: o.completedAt?.toISOString() ?? null,
    completedById: o.completedById,
    version: o.version,
  };
}

const dedupe = (ids: string[]) => [...new Set(ids)];

/** Journal d'activité : noms des champs modifiés seulement (pas de contenu). */
const changedFields = (input: UpdateOccurrenceInput) => ({
  fields: Object.keys(input).filter((k) => k !== 'version'),
});
