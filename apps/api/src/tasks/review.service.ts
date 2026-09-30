import { Injectable } from '@nestjs/common';
import type { WeeklyReviewDto, WeeklyReviewQuery } from '@agenda/contracts';
import { addDays, startOfWeek, todayIn, zonedToUtc } from '@agenda/domain';
import { fromDbDate, toDbDate } from '../common/dates';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const MAX_MISSED = 20;

/**
 * « Revue du dimanche » : ce qui a été fait cette semaine (et par qui, avec les « merci »), ce qui
 * a glissé, et la charge de la semaine suivante. Tâches partagées, plus les tâches personnelles de
 * la personne qui consulte (jamais celles des autres).
 */
@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async weekly(ctx: HouseholdContext, query: WeeklyReviewQuery): Promise<WeeklyReviewDto> {
    const { timezone: tz } = await this.prisma.household.findUniqueOrThrow({
      where: { id: ctx.householdId },
      select: { timezone: true },
    });
    const today = todayIn(tz);
    const from = startOfWeek(query.date ?? today);
    const to = addDays(from, 6);
    const nextFrom = addDays(from, 7);
    const nextTo = addDays(from, 13);
    const visible = {
      deletedAt: null,
      OR: [{ visibility: 'SHARED' as const }, { createdById: ctx.memberId }],
    };

    const [done, missed, next, members] = await Promise.all([
      this.prisma.taskOccurrence.findMany({
        where: {
          householdId: ctx.householdId,
          status: 'DONE',
          completedAt: { gte: zonedToUtc(from, 0, tz), lt: zonedToUtc(nextFrom, 0, tz) },
          task: visible,
        },
        select: {
          durationMinutes: true,
          completedById: true,
          _count: { select: { thanks: true } },
        },
      }),
      this.prisma.taskOccurrence.findMany({
        where: {
          householdId: ctx.householdId,
          status: 'TODO',
          date: { gte: toDbDate(from), lte: toDbDate(to < today ? to : addDays(today, -1)) },
          task: visible,
        },
        orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
        take: MAX_MISSED,
        select: { id: true, date: true, titleOverride: true, task: { select: { title: true } } },
      }),
      this.prisma.taskOccurrence.findMany({
        where: {
          householdId: ctx.householdId,
          status: 'TODO',
          date: { gte: toDbDate(nextFrom), lte: toDbDate(nextTo) },
          task: visible,
        },
        select: { assignees: { select: { memberId: true } } },
      }),
      this.prisma.householdMember.findMany({
        where: { householdId: ctx.householdId, leftAt: null },
        orderBy: { joinedAt: 'asc' },
        select: { id: true },
      }),
    ]);

    const byMember = new Map(
      members.map((m) => [m.id, { memberId: m.id, done: 0, minutes: 0, thanks: 0 }]),
    );
    let minutes = 0;
    for (const o of done) {
      minutes += o.durationMinutes ?? 0;
      const m = o.completedById ? byMember.get(o.completedById) : undefined;
      if (!m) continue;
      m.done += 1;
      m.minutes += o.durationMinutes ?? 0;
      m.thanks += o._count.thanks;
    }
    const load = new Map(members.map((m) => [m.id, 0]));
    let unassigned = 0;
    for (const o of next) {
      if (!o.assignees.length) unassigned += 1;
      for (const a of o.assignees)
        if (load.has(a.memberId)) load.set(a.memberId, load.get(a.memberId)! + 1);
    }

    return {
      from,
      to,
      done: done.length,
      doneMinutes: minutes,
      byMember: [...byMember.values()],
      missed: missed.map((o) => ({
        id: o.id,
        title: o.titleOverride ?? o.task.title,
        date: fromDbDate(o.date)!,
      })),
      next: {
        from: nextFrom,
        to: nextTo,
        total: next.length,
        byMember: [...load].map(([memberId, count]) => ({ memberId, count })),
        unassigned,
      },
    };
  }
}
