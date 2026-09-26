import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type BalanceDto,
  type BalanceQuery,
  type ChecklistItemInput,
  type CreateTaskInput,
  type EditScope,
  type OccurrenceDto,
  type OccurrenceQuery,
  type QuickAddPreview,
  type RecurrenceInput,
  type RecurrencePreviewInput,
  type RecurrencePreviewItem,
  type RotationInput,
  type SeriesDto,
  type StatsDto,
  type StatsQuery,
  type UpdateChecklistItemInput,
  type UpdateOccurrenceInput,
  MAX_CHECKLIST_ITEMS,
} from '@agenda/contracts';
import {
  addDays,
  continuationOffset,
  describeSlots,
  expandSeries,
  parseQuickAdd,
  type Rule,
  startOfWeek,
  todayIn,
  wallClock,
  zonedToUtc,
} from '@agenda/domain';
import { AppException, notFound } from '../common/app-exception';
import { fromDbDate, toDbDate } from '../common/dates';
import { DomainEvents } from '../common/domain-events';
import { HouseholdContext } from '../common/request-context';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { type Schedule, scheduleColumns } from './schedule';
import { boundsOf, rotationConfig, rotationMemberIds, SeriesService } from './series.service';

const occurrenceInclude = {
  task: { include: { category: true } },
  assignees: { select: { memberId: true } },
  eventLink: { select: { syncStatus: true, syncedVersion: true, lastErrorCode: true } },
  checklist: {
    orderBy: { position: 'asc' },
    select: { id: true, text: true, done: true, doneById: true },
  },
} satisfies Prisma.TaskOccurrenceInclude;

type OccurrenceRow = Prisma.TaskOccurrenceGetPayload<{ include: typeof occurrenceInclude }>;
type Tx = Prisma.TransactionClient;

const validation = (field: string, message: string) =>
  new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, message, {
    fieldErrors: { [field]: [message] },
  });

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly series: SeriesService,
    private readonly events: DomainEvents,
    private readonly notifications: NotificationsService,
  ) {}

  /** Une notification ratée ne doit jamais faire échouer l'action de l'utilisateur. */
  private async notifyAssigned(ctx: HouseholdContext, o: OccurrenceDto, memberIds: string[]) {
    if (o.visibility !== 'SHARED' || !memberIds.length) return;
    await this.notifications
      .notifyAssigned(ctx, o.id, memberIds, o.isRecurring)
      .catch((e: Error) => this.logger.warn(`Notification failed: ${e.message}`));
  }

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

  private visibleTask(ctx: HouseholdContext): Prisma.TaskWhereInput {
    return {
      householdId: ctx.householdId,
      deletedAt: null,
      OR: [{ visibility: 'SHARED' }, { createdById: ctx.memberId }],
    };
  }

  async list(ctx: HouseholdContext, query: OccurrenceQuery): Promise<OccurrenceDto[]> {
    const tz = await this.timezone(ctx);
    const today = todayIn(tz);
    await this.series.ensureHorizon(ctx.householdId, tz, query.to);
    const and: Prisma.TaskOccurrenceWhereInput[] = [this.visible(ctx)];

    switch (query.view) {
      case 'today':
        and.push({ date: toDbDate(today), status: { notIn: ['CANCELLED', 'SKIPPED'] } });
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
        and.push({ status: { notIn: ['CANCELLED', 'SKIPPED'] } });
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

  // ───────────── Séries ─────────────

  async listSeries(ctx: HouseholdContext): Promise<SeriesDto[]> {
    const tz = await this.timezone(ctx);
    await this.series.ensureHorizon(ctx.householdId, tz);
    const today = todayIn(tz);
    const rows = await this.prisma.taskSeries.findMany({
      where: {
        task: this.visibleTask(ctx),
        OR: [{ untilDate: null }, { untilDate: { gte: toDbDate(today) } }],
      },
      include: SeriesService.include,
      orderBy: { createdAt: 'asc' },
    });
    const next = await this.nextDates(
      rows.map((r) => r.id),
      today,
    );
    return rows
      .map((r) => this.series.toDto(r, next.get(r.id) ?? null))
      .filter((s) => s.nextDate !== null)
      .sort((a, b) => a.nextDate!.localeCompare(b.nextDate!));
  }

  async getSeries(ctx: HouseholdContext, id: string): Promise<SeriesDto> {
    const row = await this.prisma.taskSeries.findFirst({
      where: { id, task: this.visibleTask(ctx) },
      include: SeriesService.include,
    });
    if (!row) throw notFound();
    const today = todayIn(row.task.household.timezone);
    const next = await this.nextDates([row.id], today);
    return this.series.toDto(row, next.get(row.id) ?? null);
  }

  private async nextDates(seriesIds: string[], today: string): Promise<Map<string, string>> {
    if (!seriesIds.length) return new Map();
    const rows = await this.prisma.taskOccurrence.groupBy({
      by: ['seriesId'],
      where: { seriesId: { in: seriesIds }, status: 'TODO', date: { gte: toDbDate(today) } },
      _min: { date: true },
    });
    return new Map(rows.map((r) => [r.seriesId!, fromDbDate(r._min.date)!]));
  }

  async preview(
    ctx: HouseholdContext,
    input: RecurrencePreviewInput,
  ): Promise<RecurrencePreviewItem[]> {
    await this.validateRefs(ctx, null, rotationMemberIds(input.recurrence.rotation));
    return this.series.preview(input.startDate, input.recurrence, input.limit);
  }

  // ───────────── Création ─────────────

  async create(ctx: HouseholdContext, input: CreateTaskInput): Promise<OccurrenceDto> {
    const tz = await this.timezone(ctx);
    const personal = input.visibility === 'PERSONAL';
    const recurrence = input.recurrence
      ? this.normalizeRecurrence(ctx, input.recurrence, personal)
      : null;
    const assigneeIds = personal ? [ctx.memberId] : input.assigneeIds;
    await this.validateRefs(
      ctx,
      input.categoryId ?? null,
      recurrence ? rotationMemberIds(recurrence.rotation) : assigneeIds,
    );
    if (
      recurrence &&
      input.date &&
      !expandSeries(
        recurrence.rule as Rule,
        { startDate: input.date, untilDate: recurrence.until, count: recurrence.count },
        { from: input.date, to: addDays(input.date, 3700) },
        1,
      ).length
    ) {
      throw validation('recurrence', 'Recurrence produces no occurrence');
    }

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
          // Une tâche personnelle n'est jamais publiée dans le calendrier partagé.
          syncToCalendar: !personal && input.syncToCalendar,
        },
      });
      await this.log(tx, ctx, 'task.created', 'Task', task.id);

      if (!recurrence) {
        const occ = await tx.taskOccurrence.create({
          data: {
            householdId: ctx.householdId,
            taskId: task.id,
            ...scheduleColumns(schedule, tz),
            assignees: { create: dedupe(assigneeIds).map((memberId) => ({ memberId })) },
          },
        });
        await this.createChecklist(tx, ctx, occ.id, input.checklist);
        return occ.id;
      }

      const seriesId = await this.series.createSeries(tx, {
        taskId: task.id,
        startDate: input.date!,
        startMinute: schedule.startMinute,
        durationMinutes: schedule.durationMinutes,
        recurrence,
      });
      await this.series.materialize(tx, seriesId, this.horizonFor(tz, input.date!));
      const firstId = await this.firstOccurrenceId(tx, seriesId);
      await this.createChecklist(tx, ctx, firstId, input.checklist);
      return firstId;
    });
    this.events.householdChanged(ctx.householdId);
    const created = await this.get(ctx, occurrenceId);
    await this.notifyAssigned(
      ctx,
      created,
      recurrence ? rotationMemberIds(recurrence.rotation) : assigneeIds,
    );
    return created;
  }

  // ───────────── Sous-tâches / liste ─────────────

  private async createChecklist(
    tx: Tx,
    ctx: HouseholdContext,
    occurrenceId: string,
    texts: string[] | undefined,
  ): Promise<void> {
    if (!texts?.length) return;
    await tx.checklistItem.createMany({
      data: texts.map((text, position) => ({
        householdId: ctx.householdId,
        occurrenceId,
        text,
        position,
      })),
    });
  }

  /**
   * Ajouter, cocher, renommer ou retirer une sous-tâche. Ne touche pas à `version` : cocher un
   * article de la liste pendant que l'autre modifie la tâche ne crée pas de conflit.
   */
  async addChecklistItem(
    ctx: HouseholdContext,
    occurrenceId: string,
    input: ChecklistItemInput,
  ): Promise<OccurrenceDto> {
    const occ = await this.findVisible(ctx, occurrenceId);
    if (occ.checklist.length >= MAX_CHECKLIST_ITEMS) {
      throw validation('checklist', `At most ${MAX_CHECKLIST_ITEMS} items`);
    }
    const last = await this.prisma.checklistItem.aggregate({
      where: { occurrenceId },
      _max: { position: true },
    });
    await this.prisma.checklistItem.create({
      data: {
        householdId: ctx.householdId,
        occurrenceId,
        text: input.text,
        position: (last._max.position ?? -1) + 1,
      },
    });
    this.events.householdChanged(ctx.householdId);
    return this.get(ctx, occurrenceId);
  }

  async updateChecklistItem(
    ctx: HouseholdContext,
    occurrenceId: string,
    itemId: string,
    input: UpdateChecklistItemInput,
  ): Promise<OccurrenceDto> {
    await this.findVisible(ctx, occurrenceId);
    const { count } = await this.prisma.checklistItem.updateMany({
      where: { id: itemId, occurrenceId, householdId: ctx.householdId },
      data: {
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.done !== undefined
          ? { done: input.done, doneById: input.done ? ctx.memberId : null }
          : {}),
      },
    });
    if (!count) throw notFound();
    this.events.householdChanged(ctx.householdId);
    return this.get(ctx, occurrenceId);
  }

  async removeChecklistItem(
    ctx: HouseholdContext,
    occurrenceId: string,
    itemId: string,
  ): Promise<OccurrenceDto> {
    await this.findVisible(ctx, occurrenceId);
    // Idempotent : retirer un article déjà retiré (autre téléphone) n'est pas une erreur.
    await this.prisma.checklistItem.deleteMany({
      where: { id: itemId, occurrenceId, householdId: ctx.householdId },
    });
    this.events.householdChanged(ctx.householdId);
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
      syncToCalendar: Boolean(parsed.date) && (await this.calendarLinked(ctx)),
    });
  }

  /** Le foyer a-t-il un calendrier partagé actif ? (valeur par défaut de « Ajouter au calendrier »). */
  private async calendarLinked(ctx: HouseholdContext): Promise<boolean> {
    const link = await this.prisma.householdCalendarLink.findUnique({
      where: { householdId: ctx.householdId },
      select: { status: true },
    });
    return link?.status === 'ACTIVE';
  }

  // ───────────── Modification ─────────────

  /**
   * Portée (tâches récurrentes, cohérent avec Google Calendar) :
   * - `this` : cette occurrence uniquement (devient une exception, jamais recalculée) ;
   * - `following` : la série est coupée ; une nouvelle tâche + série démarre à cette occurrence,
   *   l'historique reste intact ;
   * - `all` : la série entière ; les occurrences futures non modifiées sont régénérées.
   * Catégorie, priorité et visibilité s'appliquent toujours à toute la tâche.
   */
  async update(
    ctx: HouseholdContext,
    id: string,
    input: UpdateOccurrenceInput,
    scope: EditScope,
  ): Promise<OccurrenceDto> {
    const before = await this.prisma.occurrenceAssignee.findMany({
      where: { occurrenceId: id },
      select: { memberId: true },
    });
    const result = await this.applyUpdate(ctx, id, input, scope);
    this.events.householdChanged(ctx.householdId);
    const previous = new Set(before.map((a) => a.memberId));
    await this.notifyAssigned(
      ctx,
      result,
      result.assigneeIds.filter((m) => !previous.has(m)),
    );
    return result;
  }

  private async applyUpdate(
    ctx: HouseholdContext,
    id: string,
    input: UpdateOccurrenceInput,
    scope: EditScope,
  ): Promise<OccurrenceDto> {
    const current = await this.findVisible(ctx, id);
    if (
      current.task.visibility !== (input.visibility ?? current.task.visibility) &&
      current.task.createdById !== ctx.memberId
    ) {
      // Seul le créateur peut rendre une tâche personnelle (ou la partager).
      throw new AppException(
        'FORBIDDEN',
        HttpStatus.FORBIDDEN,
        'Only the creator can change visibility',
      );
    }
    if (current.version !== input.version) throw this.conflict(current);

    if (!current.seriesId) {
      if (input.recurrence) return this.convertToSeries(ctx, current, input);
      return this.updateSingle(ctx, current, input, false);
    }
    if (scope === 'this') return this.updateSingle(ctx, current, input, true);
    const series = await this.prisma.taskSeries.findUniqueOrThrow({
      where: { id: current.seriesId },
      include: { slots: true },
    });
    const splitAtStart = fromDbDate(current.originalDate) === fromDbDate(series.startDate);
    if (scope === 'following' && !splitAtStart) return this.updateFollowing(ctx, current, input);
    return this.updateAll(ctx, current, input);
  }

  /** Occurrence seule (tâche ponctuelle, ou exception dans une série). */
  private async updateSingle(
    ctx: HouseholdContext,
    current: OccurrenceRow,
    input: UpdateOccurrenceInput,
    exception: boolean,
  ) {
    const task = current.task;
    const visibility = input.visibility ?? task.visibility;
    const assigneeIds =
      visibility === 'PERSONAL'
        ? [task.createdById]
        : (input.assigneeIds ??
          (task.visibility === 'PERSONAL' ? [] : current.assignees.map((a) => a.memberId)));
    await this.validateRefs(ctx, input.categoryId ?? null, assigneeIds);

    const schedule = this.mergeSchedule(current, input);
    if (exception && schedule.date === null)
      throw validation('date', 'A recurring occurrence keeps a date');
    const tz = await this.timezone(ctx);

    await this.prisma.$transaction(async (tx) => {
      // Concurrence optimiste : échoue si quelqu'un a modifié l'occurrence entre-temps.
      const { count } = await tx.taskOccurrence.updateMany({
        where: { id: current.id, version: input.version },
        data: {
          ...scheduleColumns(schedule, tz),
          ...(exception
            ? {
                isException: true,
                // Titre et notes propres à cette occurrence : la série garde les siens.
                ...(input.title !== undefined ? { titleOverride: input.title } : {}),
                ...(input.notes !== undefined ? { notesOverride: input.notes } : {}),
              }
            : {}),
          version: { increment: 1 },
          syncVersion: { increment: 1 },
        },
      });
      if (count !== 1) throw this.conflict(current);

      await tx.task.update({
        where: { id: task.id },
        data: {
          ...(exception ? {} : { title: input.title, notes: input.notes }),
          categoryId: input.categoryId,
          priority: input.priority,
          visibility,
          syncToCalendar: visibility === 'PERSONAL' ? false : input.syncToCalendar,
          version: { increment: 1 },
        },
      });
      await tx.occurrenceAssignee.deleteMany({ where: { occurrenceId: current.id } });
      await tx.occurrenceAssignee.createMany({
        data: dedupe(assigneeIds).map((memberId) => ({ occurrenceId: current.id, memberId })),
      });
      await this.log(
        tx,
        ctx,
        'occurrence.updated',
        'TaskOccurrence',
        current.id,
        changedFields(input, exception ? 'this' : undefined),
      );
    });
    return this.get(ctx, current.id);
  }

  /** Transformer une tâche ponctuelle en tâche récurrente (l'occurrence existante devient la première). */
  private async convertToSeries(
    ctx: HouseholdContext,
    current: OccurrenceRow,
    input: UpdateOccurrenceInput,
  ) {
    const schedule = this.mergeSchedule(current, input);
    if (!schedule.date) throw validation('date', 'recurrence requires date');
    const visibility = input.visibility ?? current.task.visibility;
    const recurrence = this.normalizeRecurrence(
      ctx,
      input.recurrence!,
      visibility === 'PERSONAL',
      current.task.createdById,
    );
    await this.validateRefs(ctx, input.categoryId ?? null, rotationMemberIds(recurrence.rotation));
    const tz = await this.timezone(ctx);

    const firstId = await this.prisma.$transaction(async (tx) => {
      await this.lockVersion(tx, current, input.version);
      await tx.task.update({
        where: { id: current.taskId },
        data: taskFields(input, visibility),
      });
      // L'occurrence ponctuelle est remplacée par la série (sauf si déjà faite : elle reste en historique).
      if (current.status !== 'DONE') await tx.taskOccurrence.delete({ where: { id: current.id } });
      const seriesId = await this.series.createSeries(tx, {
        taskId: current.taskId,
        startDate: schedule.date!,
        startMinute: schedule.startMinute,
        durationMinutes: schedule.durationMinutes,
        recurrence,
      });
      await this.series.materialize(tx, seriesId, this.horizonFor(tz, schedule.date!));
      await this.log(tx, ctx, 'series.created', 'TaskSeries', seriesId);
      return this.firstOccurrenceId(tx, seriesId);
    });
    return this.get(ctx, firstId);
  }

  /** « Cette occurrence et les suivantes » : découpage de la série. */
  private async updateFollowing(
    ctx: HouseholdContext,
    current: OccurrenceRow,
    input: UpdateOccurrenceInput,
  ) {
    const tz = await this.timezone(ctx);
    const old = await this.prisma.taskSeries.findUniqueOrThrow({
      where: { id: current.seriesId! },
      include: { slots: true },
    });
    const splitDate = fromDbDate(current.originalDate)!;
    const visibility = input.visibility ?? current.task.visibility;
    const oldConfig = rotationConfig(old);
    const oldRule = old.rule as Rule;
    const oldBounds = boundsOf(old);
    const splitOcc = expandSeries(oldRule, oldBounds, { from: splitDate, to: splitDate })[0];

    // Nouvelle récurrence : celle fournie, sinon la même règle ; la rotation continue au même tour.
    let recurrence: RecurrenceInput;
    let offset = 0;
    if (input.recurrence) {
      recurrence = this.normalizeRecurrence(
        ctx,
        input.recurrence,
        visibility === 'PERSONAL',
        current.task.createdById,
      );
    } else {
      const rotation: RotationInput =
        visibility === 'PERSONAL'
          ? { mode: 'FIXED', memberIds: [current.task.createdById] }
          : input.assigneeIds
            ? assigneesToRotation(input.assigneeIds)
            : (describeSlots(oldConfig.slots, old.rotationMode) as RotationInput);
      if (!input.assigneeIds && visibility !== 'PERSONAL' && splitOcc)
        offset = continuationOffset(splitOcc, oldConfig);
      recurrence = {
        rule: oldRule as RecurrenceInput['rule'],
        until: oldBounds.untilDate,
        count: old.count != null && splitOcc ? Math.max(1, old.count - splitOcc.index) : null,
        rotation,
        advance: oldConfig.advance,
      };
    }
    await this.validateRefs(ctx, input.categoryId ?? null, rotationMemberIds(recurrence.rotation));
    const schedule = this.mergeSchedule(current, input, {
      startMinute: old.startMinute,
      duration: old.durationMinutes,
    });
    const startDate = input.date ?? splitDate;

    const firstId = await this.prisma.$transaction(async (tx) => {
      await this.lockVersion(tx, current, input.version);
      // L'ancienne série s'arrête la veille ; ses occurrences futures non faites disparaissent.
      await tx.taskSeries.update({
        where: { id: old.id },
        data: { untilDate: toDbDate(addDays(splitDate, -1)) },
      });
      await tx.taskOccurrence.deleteMany({
        where: {
          seriesId: old.id,
          originalDate: { gte: toDbDate(splitDate) },
          status: { in: ['TODO', 'CANCELLED', 'SKIPPED'] },
        },
      });
      // Nouvelle tâche : l'historique de l'ancienne garde son titre, sa catégorie, etc.
      const task = await tx.task.create({
        data: {
          householdId: ctx.householdId,
          createdById: current.task.createdById,
          title: input.title ?? current.task.title,
          notes: input.notes !== undefined ? input.notes : current.task.notes,
          categoryId: input.categoryId !== undefined ? input.categoryId : current.task.categoryId,
          priority: input.priority ?? current.task.priority,
          visibility,
          syncToCalendar:
            visibility === 'PERSONAL'
              ? false
              : (input.syncToCalendar ?? current.task.syncToCalendar),
        },
      });
      const seriesId = await this.series.createSeries(tx, {
        taskId: task.id,
        startDate,
        startMinute: schedule.startMinute,
        durationMinutes: schedule.durationMinutes,
        recurrence,
        rotationOffset: offset,
      });
      await this.series.materialize(tx, seriesId, this.horizonFor(tz, startDate));
      await this.log(tx, ctx, 'series.split', 'TaskSeries', old.id, {
        newSeriesId: seriesId,
        ...changedFields(input, 'following'),
      });
      return this.firstOccurrenceId(tx, seriesId);
    });
    return this.get(ctx, firstId);
  }

  /** « Toute la série » : règles, horaires et rotation mis à jour ; futur non modifié régénéré. */
  private async updateAll(
    ctx: HouseholdContext,
    current: OccurrenceRow,
    input: UpdateOccurrenceInput,
  ) {
    const tz = await this.timezone(ctx);
    const today = todayIn(tz);
    const old = await this.prisma.taskSeries.findUniqueOrThrow({
      where: { id: current.seriesId! },
      include: { slots: true },
    });
    const visibility = input.visibility ?? current.task.visibility;
    const personal = visibility === 'PERSONAL';
    const recurrence = input.recurrence
      ? this.normalizeRecurrence(ctx, input.recurrence, personal, current.task.createdById)
      : null;
    const rotation: RotationInput | null =
      recurrence?.rotation ??
      (personal
        ? { mode: 'FIXED', memberIds: [current.task.createdById] }
        : input.assigneeIds
          ? assigneesToRotation(input.assigneeIds)
          : null);
    await this.validateRefs(
      ctx,
      input.categoryId ?? null,
      rotation ? rotationMemberIds(rotation) : [],
    );
    const schedule = this.mergeSchedule(current, input, {
      startMinute: old.startMinute,
      duration: old.durationMinutes,
    });

    await this.prisma.$transaction(async (tx) => {
      await this.lockVersion(tx, current, input.version);
      await tx.task.update({ where: { id: current.taskId }, data: taskFields(input, visibility) });
      await tx.taskSeries.update({
        where: { id: old.id },
        data: {
          ...(recurrence
            ? {
                rule: recurrence.rule as Prisma.InputJsonValue,
                untilDate: recurrence.until ? toDbDate(recurrence.until) : null,
                count: recurrence.count ?? null,
              }
            : {}),
          startMinute: schedule.startMinute,
          durationMinutes: schedule.durationMinutes,
          allDay: schedule.startMinute == null,
          version: { increment: 1 },
        },
      });
      if (rotation) {
        await this.series.replaceRotation(
          tx,
          old.id,
          rotation,
          recurrence?.advance ?? (old.rotationAdvance as 'PER_OCCURRENCE'),
        );
      }
      // Régénération à partir d'aujourd'hui, identifiants conservés ; faites / modifiées intactes.
      await this.series.regenerate(tx, old.id, today, this.horizonFor(tz, today));
      // Titre ou responsables changés : toutes les occurrences à venir sont à republier dans Google.
      await tx.taskOccurrence.updateMany({
        where: { taskId: current.taskId, date: { gte: toDbDate(addDays(today, -1)) } },
        data: { syncVersion: { increment: 1 } },
      });
      await this.log(tx, ctx, 'series.updated', 'TaskSeries', old.id, changedFields(input, 'all'));
    });

    // Renvoie l'occurrence équivalente (même date prévue) ou la prochaine.
    const same = await this.prisma.taskOccurrence.findFirst({
      where: { seriesId: old.id, originalDate: current.originalDate },
      select: { id: true },
    });
    if (same) return this.get(ctx, same.id);
    const next = await this.prisma.taskOccurrence.findFirst({
      where: { seriesId: old.id, date: { gte: toDbDate(today) }, status: 'TODO' },
      orderBy: { date: 'asc' },
      select: { id: true },
    });
    return next
      ? this.get(ctx, next.id)
      : this.get(
          ctx,
          (
            await this.prisma.taskOccurrence.findFirstOrThrow({
              where: { seriesId: old.id },
              orderBy: { date: 'desc' },
            })
          ).id,
        );
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
    this.events.householdChanged(ctx.householdId);
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
    this.events.householdChanged(ctx.householdId);
    return this.get(ctx, id);
  }

  /**
   * Suppression. Tâche ponctuelle ou `all` : suppression douce de la tâche. `this` : l'occurrence est
   * annulée (conservée pour ne jamais être régénérée). `following` : la série s'arrête la veille.
   */
  async remove(ctx: HouseholdContext, id: string, scope: EditScope): Promise<void> {
    const current = await this.findVisible(ctx, id);
    await this.prisma.$transaction(async (tx) => {
      if (!current.seriesId || scope === 'all') {
        await tx.task.update({ where: { id: current.taskId }, data: { deletedAt: new Date() } });
        await this.log(tx, ctx, 'task.deleted', 'Task', current.taskId);
        return;
      }
      if (scope === 'this') {
        await tx.taskOccurrence.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            isException: true,
            version: { increment: 1 },
            syncVersion: { increment: 1 },
          },
        });
        await this.log(tx, ctx, 'occurrence.cancelled', 'TaskOccurrence', id);
        return;
      }
      const series = await tx.taskSeries.findUniqueOrThrow({ where: { id: current.seriesId } });
      const splitDate = fromDbDate(current.originalDate)!;
      if (splitDate <= fromDbDate(series.startDate)!) {
        await tx.task.update({ where: { id: current.taskId }, data: { deletedAt: new Date() } });
        await this.log(tx, ctx, 'task.deleted', 'Task', current.taskId);
        return;
      }
      await tx.taskSeries.update({
        where: { id: series.id },
        data: { untilDate: toDbDate(addDays(splitDate, -1)) },
      });
      await tx.taskOccurrence.deleteMany({
        where: {
          seriesId: series.id,
          originalDate: { gte: toDbDate(splitDate) },
          status: { not: 'DONE' },
        },
      });
      await this.log(tx, ctx, 'series.ended', 'TaskSeries', series.id);
    });
    this.events.householdChanged(ctx.householdId);
  }

  // ───────────── Répartition ─────────────

  /** Répartition factuelle des tâches partagées sur une période (semaine courante par défaut). */
  /** Statistiques des tâches partagées sur 7 ou 30 jours (jusqu'à aujourd'hui inclus). */
  async stats(ctx: HouseholdContext, query: StatsQuery): Promise<StatsDto> {
    const tz = await this.timezone(ctx);
    const to = todayIn(tz);
    const from = addDays(to, -(query.days - 1));
    const shared = { deletedAt: null, visibility: 'SHARED' as const };
    const [done, overdue, members] = await Promise.all([
      this.prisma.taskOccurrence.findMany({
        where: {
          householdId: ctx.householdId,
          status: 'DONE',
          completedAt: { gte: zonedToUtc(from, 0, tz) },
          task: shared,
        },
        select: {
          date: true,
          durationMinutes: true,
          completedAt: true,
          completedById: true,
          task: { select: { category: { select: { id: true, name: true, emoji: true } } } },
        },
      }),
      this.prisma.taskOccurrence.count({
        where: {
          householdId: ctx.householdId,
          status: 'TODO',
          date: { lt: toDbDate(to) },
          task: shared,
        },
      }),
      this.prisma.householdMember.findMany({
        where: { householdId: ctx.householdId, leftAt: null },
        orderBy: { joinedAt: 'asc' },
        select: { id: true },
      }),
    ]);

    const perDay = new Map<string, number>();
    for (let d = from; d <= to; d = addDays(d, 1)) perDay.set(d, 0);
    const byCategory = new Map<string, StatsDto['byCategory'][number]>();
    const byMember = new Map(members.map((m) => [m.id, { memberId: m.id, done: 0, minutes: 0 }]));
    let minutes = 0;
    let late = 0;
    for (const o of done) {
      const day = wallClock(o.completedAt!, tz).date;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      const m = o.durationMinutes ?? 0;
      minutes += m;
      const planned = fromDbDate(o.date);
      if (planned && planned < day) late += 1;
      const cat = o.task.category;
      const key = cat?.id ?? 'none';
      const entry = byCategory.get(key) ?? {
        categoryId: cat?.id ?? null,
        name: cat?.name ?? null,
        emoji: cat?.emoji ?? null,
        done: 0,
        minutes: 0,
      };
      entry.done += 1;
      entry.minutes += m;
      byCategory.set(key, entry);
      const member = o.completedById ? byMember.get(o.completedById) : undefined;
      if (member) {
        member.done += 1;
        member.minutes += m;
      }
    }
    return {
      from,
      to,
      days: query.days,
      done: done.length,
      doneMinutes: minutes,
      doneLate: late,
      overdue,
      perDay: [...perDay].map(([date, count]) => ({ date, done: count })),
      byCategory: [...byCategory.values()].sort((a, b) => b.done - a.done),
      byMember: [...byMember.values()],
    };
  }

  async balance(ctx: HouseholdContext, query: BalanceQuery): Promise<BalanceDto> {
    const tz = await this.timezone(ctx);
    const today = todayIn(tz);
    const from = query.from ?? startOfWeek(today);
    const to = query.to ?? addDays(from, 6);
    await this.series.ensureHorizon(ctx.householdId, tz, to);
    const [members, rows] = await Promise.all([
      this.prisma.householdMember.findMany({
        where: { householdId: ctx.householdId, leftAt: null },
        orderBy: { joinedAt: 'asc' },
        select: { id: true },
      }),
      this.prisma.taskOccurrence.findMany({
        where: {
          householdId: ctx.householdId,
          status: { notIn: ['CANCELLED', 'SKIPPED'] },
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

  /** Horizon de génération : 90 jours, et au moins jusqu'au début de la série. */
  private horizonFor(tz: string, startDate: string): string {
    const horizon = addDays(todayIn(tz), 90);
    return startDate > horizon ? addDays(startDate, 30) : horizon;
  }

  private async firstOccurrenceId(tx: Tx, seriesId: string): Promise<string> {
    const first = await tx.taskOccurrence.findFirst({
      where: { seriesId },
      orderBy: { originalDate: 'asc' },
      select: { id: true },
    });
    if (!first) throw validation('recurrence', 'Recurrence produces no occurrence');
    return first.id;
  }

  /** Une tâche personnelle n'a qu'un responsable : son créateur. */
  private normalizeRecurrence(
    ctx: HouseholdContext,
    r: RecurrenceInput,
    personal: boolean,
    creatorId = ctx.memberId,
  ): RecurrenceInput {
    return personal ? { ...r, rotation: { mode: 'FIXED', memberIds: [creatorId] } } : r;
  }

  private mergeSchedule(
    current: OccurrenceRow,
    input: UpdateOccurrenceInput,
    seriesDefaults?: { startMinute: number | null; duration: number | null },
  ): Schedule {
    const schedule: Schedule = {
      date: input.date !== undefined ? input.date : fromDbDate(current.date),
      startMinute:
        input.startMinute !== undefined
          ? input.startMinute
          : seriesDefaults
            ? seriesDefaults.startMinute
            : current.startMinute,
      durationMinutes:
        input.durationMinutes !== undefined
          ? input.durationMinutes
          : seriesDefaults
            ? seriesDefaults.duration
            : current.durationMinutes,
    };
    // Retirer la date retire aussi l'heure.
    if (schedule.date === null) schedule.startMinute = null;
    if (input.startMinute != null && schedule.date === null)
      throw validation('startMinute', 'startMinute requires date');
    return schedule;
  }

  /** Verrou optimiste pris dans la transaction (les opérations de série modifient plusieurs lignes). */
  private async lockVersion(tx: Tx, current: OccurrenceRow, version: number) {
    const { count } = await tx.taskOccurrence.updateMany({
      where: { id: current.id, version },
      data: { version: { increment: 1 } },
    });
    if (count !== 1) throw this.conflict(current);
  }

  /** Une catégorie ou un responsable d'un autre foyer est refusé (jamais d'id « étranger »). */
  private async validateRefs(
    ctx: HouseholdContext,
    categoryId: string | null,
    memberIds: string[],
  ): Promise<void> {
    if (categoryId) {
      const found = await this.prisma.category.count({
        where: { id: categoryId, householdId: ctx.householdId, deletedAt: null },
      });
      if (!found) throw validation('categoryId', 'Unknown category');
    }
    const ids = dedupe(memberIds);
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
    seriesId: o.seriesId,
    isException: o.isException,
    syncToCalendar: o.task.syncToCalendar,
    calendarSync: calendarSyncState(o),
    completedAt: o.completedAt?.toISOString() ?? null,
    completedById: o.completedById,
    version: o.version,
    checklist: o.checklist,
  };
}

/** État affiché de la synchronisation Google de l'occurrence (✓ / ⟳ / ⚠). */
function calendarSyncState(o: OccurrenceRow): OccurrenceDto['calendarSync'] {
  if (!o.task.syncToCalendar || o.task.visibility === 'PERSONAL' || !o.date) return null;
  const l = o.eventLink;
  if (!l) {
    // Hors fenêtre synchronisée (J-1 → J+60) : pas encore concernée.
    const d = fromDbDate(o.date)!;
    const today = todayIn('UTC');
    return d >= addDays(today, -1) && d <= addDays(today, 60) ? 'PENDING' : null;
  }
  if (l.syncStatus === 'DELETED') return null;
  if (l.syncStatus === 'ERROR') return 'ERROR';
  if (l.syncStatus === 'BLOCKED') return 'BLOCKED';
  return l.syncStatus === 'SYNCED' && l.syncedVersion >= o.syncVersion ? 'SYNCED' : 'PENDING';
}

/** Responsables choisis pour « la suite » de la série : toujours ces personnes. */
function assigneesToRotation(ids: string[]): RotationInput {
  const unique = dedupe(ids);
  return unique.length === 0
    ? { mode: 'UNASSIGNED' }
    : unique.length === 1
      ? { mode: 'FIXED', memberIds: unique }
      : { mode: 'TOGETHER', memberIds: unique };
}

function taskFields(input: UpdateOccurrenceInput, visibility: 'PERSONAL' | 'SHARED') {
  return {
    title: input.title,
    notes: input.notes,
    categoryId: input.categoryId,
    priority: input.priority,
    visibility,
    syncToCalendar: visibility === 'PERSONAL' ? false : input.syncToCalendar,
    version: { increment: 1 },
  };
}

const dedupe = (ids: string[]) => [...new Set(ids)];

/** Journal d'activité : noms des champs modifiés seulement (pas de contenu). */
const changedFields = (input: UpdateOccurrenceInput, scope?: EditScope) => ({
  fields: Object.keys(input).filter((k) => k !== 'version'),
  ...(scope ? { scope } : {}),
});
