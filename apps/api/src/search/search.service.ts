import { Injectable } from '@nestjs/common';
import type { SearchResultsDto } from '@agenda/contracts';
import { todayIn } from '@agenda/domain';
import { fromDbDate } from '../common/dates';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const LIMIT = 8;

/** Extrait autour du premier passage trouvé (contenu d'une note). */
const snippet = (text: string, q: string): string => {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return text.slice(0, 80);
  const start = Math.max(0, at - 30);
  return (start > 0 ? '…' : '') + text.slice(start, start + 80).replace(/\s+/g, ' ');
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cherche dans les tâches (titre, notes, titre d'une occurrence), les notes, les dates
   * importantes, les dépenses et les courses du foyer. Les tâches et dépenses personnelles de
   * l'autre restent invisibles.
   */
  async search(ctx: HouseholdContext, q: string): Promise<SearchResultsDto> {
    const like = { contains: q, mode: 'insensitive' as const };
    const householdId = ctx.householdId;
    const household = await this.prisma.household.findUniqueOrThrow({
      where: { id: householdId },
      select: { timezone: true },
    });
    const today = todayIn(household.timezone);
    const [tasks, notes, dates, expenses, shopping] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          householdId,
          deletedAt: null,
          AND: [
            { OR: [{ visibility: 'SHARED' }, { createdById: ctx.memberId }] },
            {
              OR: [
                { title: like },
                { notes: like },
                { occurrences: { some: { titleOverride: like } } },
              ],
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: LIMIT,
        select: {
          title: true,
          occurrences: {
            orderBy: [{ date: 'asc' }, { dueDate: 'asc' }],
            select: { id: true, date: true, dueDate: true, status: true, titleOverride: true },
          },
        },
      }),
      this.prisma.note.findMany({
        where: { householdId, OR: [{ title: like }, { body: like }] },
        orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
        take: LIMIT,
        select: { id: true, title: true, body: true },
      }),
      this.prisma.importantDate.findMany({
        where: { householdId, title: like },
        orderBy: [{ month: 'asc' }, { day: 'asc' }],
        take: LIMIT,
        select: { id: true, title: true, kind: true, month: true, day: true },
      }),
      this.prisma.expense.findMany({
        where: {
          householdId,
          title: like,
          OR: [{ split: { not: 'PERSONAL' } }, { paidById: ctx.memberId }],
        },
        orderBy: { date: 'desc' },
        take: LIMIT,
        select: { id: true, title: true, date: true, amountCents: true },
      }),
      this.prisma.shoppingItem.findMany({
        where: { householdId, text: like },
        orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
        take: LIMIT,
        select: { id: true, text: true, done: true },
      }),
    ]);

    return {
      tasks: tasks.flatMap((t) => {
        // La prochaine occurrence à faire, sinon la plus récente.
        const when = (o: (typeof t.occurrences)[number]) => fromDbDate(o.date ?? o.dueDate);
        const next =
          t.occurrences.find((o) => o.status === 'TODO' && (when(o) ?? today) >= today) ??
          [...t.occurrences].reverse().find((o) => (when(o) ?? today) <= today) ??
          t.occurrences[0];
        if (!next) return [];
        return [
          {
            occurrenceId: next.id,
            title: next.titleOverride ?? t.title,
            date: when(next),
            done: next.status === 'DONE',
          },
        ];
      }),
      notes: notes.map((n) => ({ id: n.id, title: n.title, snippet: snippet(n.body, q) })),
      dates,
      expenses: expenses.map((e) => ({
        id: e.id,
        title: e.title,
        date: fromDbDate(e.date)!,
        amountCents: e.amountCents,
      })),
      shopping,
    };
  }
}
