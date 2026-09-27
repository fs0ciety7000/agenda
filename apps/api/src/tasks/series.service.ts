import { Injectable } from '@nestjs/common';
import { Prisma, type RotationMode } from '@prisma/client';
import type {
  RecurrenceInput,
  RecurrencePreviewItem,
  RotationInput,
  SeriesDto,
} from '@agenda/contracts';
import {
  addDays,
  assigneesFor,
  buildSlots,
  describeSlots,
  expandSeries,
  iterateSeries,
  nextAfter,
  type RotationConfig,
  type Rule,
  todayIn,
} from '@agenda/domain';
import { randomUUID } from 'node:crypto';
import { fromDbDate, toDbDate } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { scheduleColumns } from './schedule';

type Tx = Prisma.TransactionClient;

/** Horizon de matérialisation glissant (ADR-004) et plafond pour les vues lointaines. */
export const HORIZON_DAYS = 90;
export const MAX_HORIZON_DAYS = 400;

const seriesInclude = {
  slots: true,
  task: { include: { category: true, household: { select: { timezone: true } } } },
} satisfies Prisma.TaskSeriesInclude;
type SeriesRow = Prisma.TaskSeriesGetPayload<{ include: typeof seriesInclude }>;

export const rotationConfig = (s: {
  slots: SeriesRow['slots'];
  rotationAdvance: string;
  rotationOffset: number;
}): RotationConfig => ({
  slots: s.slots.map((x) => ({ weekday: x.weekday, position: x.position, memberId: x.memberId })),
  advance: s.rotationAdvance === 'PER_WEEK' ? 'PER_WEEK' : 'PER_OCCURRENCE',
  offset: s.rotationOffset,
});

export const boundsOf = (s: { startDate: Date; untilDate: Date | null; count: number | null }) => ({
  startDate: fromDbDate(s.startDate)!,
  untilDate: fromDbDate(s.untilDate),
  count: s.count,
});

/** Tous les membres cités par une rotation (pour vérifier qu'ils appartiennent au foyer). */
export function rotationMemberIds(rotation: RotationInput): string[] {
  return [...new Set(buildSlots(rotation).map((s) => s.memberId))];
}

@Injectable()
export class SeriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crée la série + ses slots de rotation (dans la transaction de l'appelant). */
  async createSeries(
    tx: Tx,
    args: {
      taskId: string;
      startDate: string;
      startMinute: number | null;
      durationMinutes: number | null;
      recurrence: RecurrenceInput;
      rotationOffset?: number;
    },
  ): Promise<string> {
    const { recurrence } = args;
    const series = await tx.taskSeries.create({
      data: {
        taskId: args.taskId,
        rule: recurrence.rule as Prisma.InputJsonValue,
        startDate: toDbDate(args.startDate),
        untilDate: recurrence.until ? toDbDate(recurrence.until) : null,
        count: recurrence.count ?? null,
        startMinute: args.startMinute,
        durationMinutes: args.durationMinutes,
        allDay: args.startMinute == null,
        rotationMode: recurrence.rotation.mode as RotationMode,
        rotationAdvance: recurrence.advance,
        rotationOffset: args.rotationOffset ?? 0,
        slots: { create: buildSlots(recurrence.rotation) },
      },
    });
    return series.id;
  }

  /** Remplace la rotation d'une série existante. */
  async replaceRotation(
    tx: Tx,
    seriesId: string,
    rotation: RotationInput,
    advance: 'PER_OCCURRENCE' | 'PER_WEEK',
    offset = 0,
  ) {
    await tx.rotationSlot.deleteMany({ where: { seriesId } });
    await tx.rotationSlot.createMany({
      data: buildSlots(rotation).map((s) => ({ ...s, seriesId })),
    });
    await tx.taskSeries.update({
      where: { id: seriesId },
      data: {
        rotationMode: rotation.mode as RotationMode,
        rotationAdvance: advance,
        rotationOffset: offset,
      },
    });
  }

  /**
   * Matérialise les occurrences d'une série jusqu'à `until` (inclus). Idempotent :
   * une date déjà présente (même modifiée ou supprimée) n'est jamais recréée.
   */
  async materialize(tx: Tx, seriesId: string, until: string): Promise<void> {
    // Un seul générateur à la fois par série (requêtes concurrentes des deux membres).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${seriesId}))`;
    const series = await tx.taskSeries.findUnique({
      where: { id: seriesId },
      include: seriesInclude,
    });
    if (!series || series.task.deletedAt) return;
    const bounds = boundsOf(series);
    const from = series.generatedUntil
      ? addDays(fromDbDate(series.generatedUntil)!, 1)
      : bounds.startDate;
    const to = bounds.untilDate && bounds.untilDate < until ? bounds.untilDate : until;

    if (from <= to) {
      const generated = expandSeries(series.rule as Rule, bounds, { from, to });
      const existing = new Set(
        (
          await tx.taskOccurrence.findMany({
            where: { seriesId, originalDate: { gte: toDbDate(from), lte: toDbDate(to) } },
            select: { originalDate: true },
          })
        ).map((o) => fromDbDate(o.originalDate)),
      );
      const config = rotationConfig(series);
      const tz = series.task.household.timezone;
      const rows = generated
        .filter((g) => !existing.has(g.date))
        .map((g) => ({
          id: randomUUID(),
          assignees: assigneesFor(g, config),
          data: {
            householdId: series.task.householdId,
            taskId: series.taskId,
            seriesId,
            seriesIndex: g.index,
            originalDate: toDbDate(g.date),
            ...scheduleColumns(
              {
                date: g.date,
                startMinute: series.startMinute,
                durationMinutes: series.durationMinutes,
              },
              tz,
            ),
          },
        }));
      if (rows.length) {
        await tx.taskOccurrence.createMany({ data: rows.map((r) => ({ id: r.id, ...r.data })) });
        await tx.occurrenceAssignee.createMany({
          data: rows.flatMap((r) =>
            r.assignees.map((memberId) => ({ occurrenceId: r.id, memberId })),
          ),
        });
      }
    }
    if (!series.generatedUntil || fromDbDate(series.generatedUntil)! < until) {
      await tx.taskSeries.update({
        where: { id: seriesId },
        data: { generatedUntil: toDbDate(until) },
      });
    }
  }

  /**
   * Régénère la série à partir de `from` en CONSERVANT les identifiants des occurrences existantes
   * (essentiel pour Google Calendar : un id d'occurrence = un événement). Les occurrences faites,
   * annulées ou modifiées à la main ne sont jamais touchées.
   */
  async regenerate(tx: Tx, seriesId: string, from: string, until: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${seriesId}))`;
    const series = await tx.taskSeries.findUniqueOrThrow({
      where: { id: seriesId },
      include: seriesInclude,
    });
    const bounds = boundsOf(series);
    const config = rotationConfig(series);
    const tz = series.task.household.timezone;
    const expected = new Map(
      expandSeries(series.rule as Rule, bounds, { from, to: until }).map(
        (g) => [g.date, g] as const,
      ),
    );
    const existing = await tx.taskOccurrence.findMany({
      where: { seriesId, originalDate: { gte: toDbDate(from) } },
      include: { assignees: true },
    });
    for (const occ of existing) {
      const key = fromDbDate(occ.originalDate)!;
      const g = expected.get(key);
      if (occ.status !== 'TODO' || occ.isException) continue; // historique / choix explicite
      if (!g) {
        await tx.taskOccurrence.delete({ where: { id: occ.id } }); // n'existe plus dans la nouvelle règle
        continue;
      }
      const assignees = assigneesFor(g, config);
      await tx.taskOccurrence.update({
        where: { id: occ.id },
        data: {
          seriesIndex: g.index,
          ...scheduleColumns(
            {
              date: g.date,
              startMinute: series.startMinute,
              durationMinutes: series.durationMinutes,
            },
            tz,
          ),
          version: { increment: 1 },
          syncVersion: { increment: 1 },
        },
      });
      const current = occ.assignees
        .map((a) => a.memberId)
        .sort()
        .join();
      if (current !== [...assignees].sort().join()) {
        await tx.occurrenceAssignee.deleteMany({ where: { occurrenceId: occ.id } });
        await tx.occurrenceAssignee.createMany({
          data: assignees.map((memberId) => ({ occurrenceId: occ.id, memberId })),
        });
      }
    }
    // Dates nouvellement produites par la règle : créées par la matérialisation normale.
    await tx.taskSeries.update({
      where: { id: seriesId },
      data: { generatedUntil: toDbDate(addDays(from, -1)) },
    });
    await this.materialize(tx, seriesId, until);
  }

  /**
   * Règle « après la dernière fois » : l'occurrence en cours vient d'être faite (ou annulée) le jour
   * `doneDate` → la série repart de doneDate + intervalle, au tour de rotation suivant. Sans effet
   * pour les autres règles, ou si une occurrence plus récente attend déjà.
   */
  async advanceAfter(tx: Tx, seriesId: string, originalDate: string, doneDate: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${seriesId}))`;
    const series = await tx.taskSeries.findUnique({ where: { id: seriesId } });
    const rule = series?.rule as Rule | undefined;
    if (!series || rule?.freq !== 'AFTER') return;
    const pending = await tx.taskOccurrence.count({
      where: { seriesId, status: 'TODO', originalDate: { gt: toDbDate(originalDate) } },
    });
    if (pending) return;
    let next = nextAfter(rule, doneDate);
    const until = fromDbDate(series.untilDate);
    // Date déjà prise par une ancienne occurrence (faite en avance) : le lendemain.
    const taken = new Set(
      (
        await tx.taskOccurrence.findMany({
          where: { seriesId, originalDate: { gte: toDbDate(next) } },
          select: { originalDate: true },
        })
      ).map((o) => fromDbDate(o.originalDate)),
    );
    while (taken.has(next)) next = addDays(next, 1);
    if (until && next > until) return; // série terminée
    await tx.taskSeries.update({
      where: { id: seriesId },
      data: {
        startDate: toDbDate(next),
        rotationOffset: { increment: 1 },
        generatedUntil: null,
        version: { increment: 1 },
      },
    });
    await this.materialize(tx, seriesId, addDays(next, HORIZON_DAYS));
  }

  /**
   * « Annuler » après avoir coché une tâche « après la dernière fois » : l'occurrence suivante, pas
   * encore touchée, disparaît et la série revient sur celle-ci.
   */
  async rewindAfter(tx: Tx, seriesId: string, occurrence: { originalDate: Date | null }) {
    if (!occurrence.originalDate) return;
    const originalDate = occurrence.originalDate;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${seriesId}))`;
    const series = await tx.taskSeries.findUnique({ where: { id: seriesId } });
    if (!series || (series.rule as Rule).freq !== 'AFTER') return;
    if (series.startDate.getTime() <= originalDate.getTime()) return;
    const next = await tx.taskOccurrence.findFirst({
      where: { seriesId, originalDate: series.startDate },
    });
    if (next && (next.status !== 'TODO' || next.isException)) return; // déjà prise en main
    if (next) await tx.taskOccurrence.delete({ where: { id: next.id } });
    await tx.taskSeries.update({
      where: { id: seriesId },
      data: {
        startDate: originalDate,
        rotationOffset: { decrement: 1 },
        generatedUntil: originalDate,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Règle « après la dernière fois » posée ou modifiée : la série repart de `anchor`. L'occurrence
   * en attente est déplacée (même identifiant : événement Google, sous-tâches conservés) ; les
   * autres occurrences à venir d'une ancienne règle disparaissent.
   */
  async reanchorAfter(tx: Tx, seriesId: string, anchor: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${seriesId}))`;
    const pending = await tx.taskOccurrence.findMany({
      where: { seriesId, status: 'TODO', isException: false },
      orderBy: { originalDate: 'asc' },
      select: { id: true },
    });
    const [keep, ...drop] = pending;
    if (drop.length)
      await tx.taskOccurrence.deleteMany({ where: { id: { in: drop.map((p) => p.id) } } });
    const taken = new Set(
      (
        await tx.taskOccurrence.findMany({
          where: { seriesId, id: { not: keep?.id } },
          select: { originalDate: true },
        })
      ).map((o) => fromDbDate(o.originalDate)),
    );
    let date = anchor;
    while (taken.has(date)) date = addDays(date, 1);
    if (keep) {
      await tx.taskOccurrence.update({
        where: { id: keep.id },
        data: { originalDate: toDbDate(date) },
      });
    }
    await tx.taskSeries.update({
      where: { id: seriesId },
      data: { startDate: toDbDate(date), generatedUntil: null },
    });
    return date;
  }

  /**
   * Matérialisation paresseuse : avant toute lecture, les séries du foyer sont étendues jusqu'à
   * l'horizon demandé. Pas de tâche planifiée nécessaire (un job BullMQ s'y ajoutera en Phase 4).
   */
  async ensureHorizon(householdId: string, tz: string, requestedTo?: string): Promise<void> {
    const today = todayIn(tz);
    const min = addDays(today, HORIZON_DAYS);
    const max = addDays(today, MAX_HORIZON_DAYS);
    const until = requestedTo && requestedTo > min ? (requestedTo < max ? requestedTo : max) : min;
    const candidates = await this.prisma.taskSeries.findMany({
      where: {
        task: { householdId, deletedAt: null },
        OR: [{ generatedUntil: null }, { generatedUntil: { lt: toDbDate(until) } }],
      },
      select: { id: true, untilDate: true, generatedUntil: true },
    });
    // Série terminée et déjà entièrement générée : rien à faire.
    const stale = candidates.filter(
      (s) => !(s.untilDate && s.generatedUntil && s.generatedUntil >= s.untilDate),
    );
    for (const { id } of stale) {
      await this.prisma.$transaction((tx) => this.materialize(tx, id, until));
    }
  }

  /** Aperçu des prochaines occurrences et de leurs responsables (formulaire). */
  preview(startDate: string, recurrence: RecurrenceInput, limit: number): RecurrencePreviewItem[] {
    const config: RotationConfig = {
      slots: buildSlots(recurrence.rotation),
      advance: recurrence.advance,
      offset: 0,
    };
    const out: RecurrencePreviewItem[] = [];
    for (const occ of iterateSeries(recurrence.rule as Rule, {
      startDate,
      untilDate: recurrence.until,
      count: recurrence.count,
    })) {
      out.push({ date: occ.date, assigneeIds: assigneesFor(occ, config) });
      if (out.length >= limit) break;
    }
    return out;
  }

  toDto(series: SeriesRow, nextDate: string | null): SeriesDto {
    return {
      id: series.id,
      taskId: series.taskId,
      title: series.task.title,
      rule: series.rule as SeriesDto['rule'],
      startDate: fromDbDate(series.startDate)!,
      untilDate: fromDbDate(series.untilDate),
      count: series.count,
      startMinute: series.startMinute,
      durationMinutes: series.durationMinutes,
      rotation: describeSlots(
        series.slots.map((s) => ({
          weekday: s.weekday,
          position: s.position,
          memberId: s.memberId,
        })),
        series.rotationMode,
      ) as SeriesDto['rotation'],
      advance: series.rotationAdvance,
      category:
        series.task.category && !series.task.category.deletedAt
          ? {
              id: series.task.category.id,
              name: series.task.category.name,
              emoji: series.task.category.emoji,
            }
          : null,
      visibility: series.task.visibility,
      nextDate,
    };
  }

  static include = seriesInclude;
}
