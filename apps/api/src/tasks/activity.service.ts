import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ACTIVITY_RETENTION_DAYS,
  type ActivityDto,
  type ActivityPageDto,
  type ActivityQuery,
  TRASH_RETENTION_DAYS,
  type TrashItemDto,
  type TrashKind,
} from '@agenda/contracts';
import { addDays } from '@agenda/domain';
import { notFound } from '../common/app-exception';
import { fromDbDate, toDbDate } from '../common/dates';
import { DomainEvents } from '../common/domain-events';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { SeriesService } from './series.service';

const DAY_MS = 86_400_000;
const PURGE_EVERY_MS = 6 * 3_600_000;

/** Actions du journal qui mettent quelque chose à la corbeille. */
const TRASH_ACTIONS: Record<string, TrashKind> = {
  'task.deleted': 'task',
  'occurrence.cancelled': 'occurrence',
  'series.ended': 'following',
};

type LogRow = Prisma.ActivityLogGetPayload<object>;
type LogData = {
  fields?: string[];
  date?: string;
  occurrenceId?: string;
  splitDate?: string;
  previousUntil?: string | null;
};

const dataOf = (l: LogRow) => (l.data ?? {}) as LogData;

/**
 * Journal d'activité (lecture, export) et corbeille : une suppression reste restaurable
 * 30 jours, puis la tâche est effacée pour de bon (purge périodique).
 */
@Injectable()
export class ActivityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly series: SeriesService,
    private readonly events: DomainEvents,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const run = () =>
      void this.purge().catch((e: unknown) => this.logger.error({ err: e }, 'purge failed'));
    setTimeout(run, 60_000).unref();
    this.timer = setInterval(run, PURGE_EVERY_MS).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Entrées visibles : tout le partagé, et ses propres tâches personnelles. */
  private visible(ctx: HouseholdContext): Prisma.ActivityLogWhereInput {
    return {
      householdId: ctx.householdId,
      OR: [{ personal: false }, { actorId: ctx.memberId }],
    };
  }

  async list(ctx: HouseholdContext, query: ActivityQuery): Promise<ActivityPageDto> {
    const rows = await this.prisma.activityLog.findMany({
      where: this.visible(ctx),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toActivityDto),
      next: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  // ───────────── Corbeille ─────────────

  async trash(ctx: HouseholdContext): Promise<TrashItemDto[]> {
    const since = new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS);
    const logs = await this.prisma.activityLog.findMany({
      where: {
        AND: [this.visible(ctx), { action: { in: Object.keys(TRASH_ACTIONS) } }],
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Une seule entrée par élément : la suppression la plus récente.
    const latest = new Map<string, LogRow>();
    for (const l of logs) if (!latest.has(l.entityId)) latest.set(l.entityId, l);

    const items: TrashItemDto[] = [];
    for (const l of latest.values()) {
      if (!(await this.restorable(l))) continue;
      items.push({
        id: l.id,
        kind: TRASH_ACTIONS[l.action]!,
        title: l.title ?? '',
        date: dataOf(l).date ?? dataOf(l).splitDate ?? null,
        deletedAt: l.createdAt.toISOString(),
        deletedById: l.actorId,
        purgeAt: new Date(l.createdAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS).toISOString(),
      });
    }
    return items;
  }

  /** L'élément est-il toujours dans l'état laissé par cette suppression ? */
  private async restorable(l: LogRow): Promise<boolean> {
    switch (l.action) {
      case 'task.deleted': {
        const task = await this.prisma.task.findUnique({
          where: { id: l.entityId },
          select: { deletedAt: true },
        });
        return !!task?.deletedAt;
      }
      case 'occurrence.cancelled': {
        const occ = await this.prisma.taskOccurrence.findUnique({
          where: { id: l.entityId },
          select: { status: true, task: { select: { deletedAt: true } } },
        });
        return occ?.status === 'CANCELLED' && !occ.task.deletedAt;
      }
      case 'series.ended': {
        const { splitDate } = dataOf(l);
        if (!splitDate) return false;
        const s = await this.prisma.taskSeries.findUnique({
          where: { id: l.entityId },
          select: { untilDate: true, task: { select: { deletedAt: true } } },
        });
        return !!s && !s.task.deletedAt && fromDbDate(s.untilDate) === addDays(splitDate, -1);
      }
      default:
        return false;
    }
  }

  /** Restaure un élément de la corbeille ; renvoie l'occurrence à rouvrir (si elle existe). */
  async restore(ctx: HouseholdContext, logId: string): Promise<{ occurrenceId: string | null }> {
    const since = new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS);
    const l = await this.prisma.activityLog.findFirst({
      where: {
        AND: [this.visible(ctx), { id: logId, action: { in: Object.keys(TRASH_ACTIONS) } }],
        createdAt: { gte: since },
      },
    });
    if (!l || !(await this.restorable(l))) throw notFound();
    const household = await this.prisma.household.findUniqueOrThrow({
      where: { id: ctx.householdId },
      select: { timezone: true },
    });
    const data = dataOf(l);

    let occurrenceId: string | null = data.occurrenceId ?? null;
    await this.prisma.$transaction(async (tx) => {
      const log = (action: string, entityType: string, entityId: string) =>
        tx.activityLog.create({
          data: {
            householdId: ctx.householdId,
            actorId: ctx.memberId,
            action,
            entityType,
            entityId,
            title: l.title,
            personal: l.personal,
            data: data.date ? { date: data.date } : undefined,
          },
        });

      if (l.action === 'task.deleted') {
        await tx.task.update({
          where: { id: l.entityId },
          data: { deletedAt: null, version: { increment: 1 } },
        });
        // Événements Google supprimés entre-temps : à republier.
        await tx.taskOccurrence.updateMany({
          where: { taskId: l.entityId },
          data: { syncVersion: { increment: 1 } },
        });
        await log('task.restored', 'Task', l.entityId);
      } else if (l.action === 'occurrence.cancelled') {
        await tx.taskOccurrence.update({
          where: { id: l.entityId },
          data: { status: 'TODO', version: { increment: 1 }, syncVersion: { increment: 1 } },
        });
        occurrenceId = l.entityId;
        await log('occurrence.restored', 'TaskOccurrence', l.entityId);
      } else {
        // Fin de répétition annulée : la série reprend, les dates retirées sont regénérées.
        await tx.taskSeries.update({
          where: { id: l.entityId },
          data: {
            untilDate: data.previousUntil ? toDbDate(data.previousUntil) : null,
            generatedUntil: toDbDate(addDays(data.splitDate!, -1)),
          },
        });
        await log('series.restored', 'TaskSeries', l.entityId);
      }
    });
    await this.series.ensureHorizon(ctx.householdId, household.timezone);

    if (l.action === 'series.ended') {
      const next = await this.prisma.taskOccurrence.findFirst({
        where: {
          seriesId: l.entityId,
          originalDate: { gte: toDbDate(data.splitDate!) },
          status: 'TODO',
        },
        orderBy: { originalDate: 'asc' },
        select: { id: true },
      });
      occurrenceId = next?.id ?? null;
    } else if (occurrenceId) {
      const exists = await this.prisma.taskOccurrence.findUnique({
        where: { id: occurrenceId },
        select: { id: true },
      });
      if (!exists) occurrenceId = null;
    }
    this.events.householdChanged(ctx.householdId);
    return { occurrenceId };
  }

  /**
   * « Annuler » juste après une suppression : restaure la dernière suppression qui concerne
   * cette occurrence (tâche entière, cette fois, ou les suivantes).
   */
  async restoreOccurrence(
    ctx: HouseholdContext,
    occurrenceId: string,
  ): Promise<{ occurrenceId: string | null }> {
    const l = await this.prisma.activityLog.findFirst({
      where: {
        AND: [
          this.visible(ctx),
          { action: { in: Object.keys(TRASH_ACTIONS) } },
          {
            OR: [
              { entityId: occurrenceId },
              { data: { path: ['occurrenceId'], equals: occurrenceId } },
            ],
          },
        ],
        createdAt: { gte: new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!l) throw notFound();
    return this.restore(ctx, l.id);
  }

  /**
   * Suppression définitive des tâches dans la corbeille depuis plus de 30 jours, et du journal
   * de plus d'un an. Appelée périodiquement (toutes les 6 h).
   */
  async purge(now = new Date()): Promise<{ tasks: number; logs: number }> {
    const tasks = await this.prisma.task.deleteMany({
      where: { deletedAt: { lt: new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS) } },
    });
    const logs = await this.prisma.activityLog.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * DAY_MS) } },
    });
    if (tasks.count || logs.count)
      this.logger.log({ tasks: tasks.count, logs: logs.count }, 'purge');
    return { tasks: tasks.count, logs: logs.count };
  }
}

function toActivityDto(l: LogRow): ActivityDto {
  const data = dataOf(l);
  return {
    id: l.id,
    action: l.action,
    at: l.createdAt.toISOString(),
    actorId: l.actorId,
    title: l.title,
    date: data.date ?? data.splitDate ?? null,
    fields: Array.isArray(data.fields) ? data.fields : [],
  };
}
