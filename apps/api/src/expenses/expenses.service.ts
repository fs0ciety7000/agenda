import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Expense, type ExpenseShare } from '@prisma/client';
import {
  EXPENSE_CURRENCY,
  type ExpenseCategory,
  type ExpenseDto,
  type ExpenseInput,
  type ExpenseSplit,
  type ExpenseSummaryDto,
  type ExpenseWeightsInput,
  type SettleInput,
  type UpdateExpenseInput,
} from '@agenda/contracts';
import { settleTransfers, splitCents, todayIn } from '@agenda/domain';
import { AppException, notFound } from '../common/app-exception';
import { fromDbDate, toDbDate } from '../common/dates';
import { DomainEvents } from '../common/domain-events';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

type ExpenseWithShares = Expense & { shares: ExpenseShare[] };

const invalid = (message: string) =>
  new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, message);

const toDto = (e: ExpenseWithShares): ExpenseDto => ({
  id: e.id,
  kind: e.kind,
  paidById: e.paidById,
  amountCents: e.amountCents,
  date: fromDbDate(e.date)!,
  title: e.title,
  category: e.category,
  split: e.split,
  forMemberId: e.forMemberId,
  note: e.note,
  shares: e.shares
    .map((s) => ({ memberId: s.memberId, amountCents: s.amountCents }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId)),
  createdById: e.createdById,
  createdAt: e.createdAt.toISOString(),
});

/** Premier et dernier jour d'un mois « 2026-10 ». */
function monthRange(month: string): { gte: Date; lte: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lte: new Date(Date.UTC(y, m, 0)) };
}

/** Une dépense personnelle n'est visible que de la personne qui l'a payée. */
const visibleTo = (memberId: string): Prisma.ExpenseWhereInput => ({
  OR: [{ split: { not: 'PERSONAL' } }, { paidById: memberId }],
});

/**
 * Dépenses du foyer. Chaque dépense enregistre la part de chacun (figée) ; le solde d'un membre
 * est ce qu'il a payé moins la somme de ses parts, depuis le début. Un remboursement est une
 * « dépense » payée par le débiteur dont toute la part revient au créancier.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  async list(ctx: HouseholdContext, month: string): Promise<ExpenseDto[]> {
    const rows = await this.prisma.expense.findMany({
      where: { householdId: ctx.householdId, date: monthRange(month), ...visibleTo(ctx.memberId) },
      include: { shares: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toDto);
  }

  async create(ctx: HouseholdContext, input: ExpenseInput): Promise<ExpenseDto> {
    if (input.id) {
      const existing = await this.prisma.expense.findUnique({
        where: { id: input.id },
        include: { shares: true },
      });
      // Renvoi d'un appareil hors ligne : même dépense, pas de doublon.
      if (existing) {
        if (existing.householdId !== ctx.householdId) throw notFound();
        return toDto(existing);
      }
    }
    const members = await this.activeMembers(ctx.householdId);
    const shares = this.computeShares(input, members);
    const expense = await this.prisma.expense.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        householdId: ctx.householdId,
        paidById: input.paidById,
        amountCents: input.amountCents,
        date: toDbDate(input.date),
        title: input.title,
        category: input.category,
        split: input.split,
        forMemberId: input.split === 'FOR_OTHER' ? input.forMemberId! : null,
        note: input.note || null,
        createdById: ctx.memberId,
        shares: { create: shares },
      },
      include: { shares: true },
    });
    this.events.publish(ctx.householdId, 'expenses');
    return toDto(expense);
  }

  async settle(ctx: HouseholdContext, input: SettleInput): Promise<ExpenseDto> {
    if (input.id) {
      const existing = await this.prisma.expense.findUnique({
        where: { id: input.id },
        include: { shares: true },
      });
      if (existing) {
        if (existing.householdId !== ctx.householdId) throw notFound();
        return toDto(existing);
      }
    }
    const members = await this.allMembers(ctx.householdId);
    for (const id of [input.fromMemberId, input.toMemberId]) {
      if (!members.some((m) => m.id === id)) throw invalid('Unknown member');
    }
    const expense = await this.prisma.expense.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        householdId: ctx.householdId,
        kind: 'SETTLEMENT',
        paidById: input.fromMemberId,
        forMemberId: input.toMemberId,
        amountCents: input.amountCents,
        date: toDbDate(input.date ?? todayIn(await this.timezone(ctx.householdId))),
        title: 'Remboursement',
        category: 'OTHER',
        split: 'FOR_OTHER',
        createdById: ctx.memberId,
        shares: { create: [{ memberId: input.toMemberId, amountCents: input.amountCents }] },
      },
      include: { shares: true },
    });
    this.events.publish(ctx.householdId, 'expenses');
    return toDto(expense);
  }

  async update(ctx: HouseholdContext, id: string, input: UpdateExpenseInput): Promise<ExpenseDto> {
    const current = await this.find(ctx, id);
    if (current.kind === 'SETTLEMENT') {
      throw invalid('A settlement cannot be edited; delete it and record a new one');
    }
    const next = {
      paidById: input.paidById ?? current.paidById,
      amountCents: input.amountCents ?? current.amountCents,
      split: input.split ?? current.split,
      forMemberId: input.forMemberId !== undefined ? input.forMemberId : current.forMemberId,
    };
    if (next.split === 'FOR_OTHER' && (!next.forMemberId || next.forMemberId === next.paidById)) {
      throw invalid('forMemberId is required and must differ from paidById');
    }
    const sharesChanged =
      input.paidById !== undefined ||
      input.amountCents !== undefined ||
      input.split !== undefined ||
      input.forMemberId !== undefined;
    const shares = sharesChanged
      ? this.computeShares(next, await this.activeMembers(ctx.householdId))
      : null;
    const expense = await this.prisma.$transaction(async (tx) => {
      if (shares) await tx.expenseShare.deleteMany({ where: { expenseId: id } });
      return tx.expense.update({
        where: { id },
        data: {
          paidById: next.paidById,
          amountCents: next.amountCents,
          split: next.split,
          forMemberId: next.split === 'FOR_OTHER' ? next.forMemberId : null,
          ...(input.date ? { date: toDbDate(input.date) } : {}),
          ...(input.title ? { title: input.title } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.note !== undefined ? { note: input.note || null } : {}),
          ...(shares ? { shares: { create: shares } } : {}),
        },
        include: { shares: true },
      });
    });
    this.events.publish(ctx.householdId, 'expenses');
    return toDto(expense);
  }

  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    await this.find(ctx, id);
    await this.prisma.expense.delete({ where: { id } });
    this.events.publish(ctx.householdId, 'expenses');
  }

  async summary(ctx: HouseholdContext, month: string): Promise<ExpenseSummaryDto> {
    const householdId = ctx.householdId;
    const [members, paidAll, sharesAll, monthRows] = await Promise.all([
      this.allMembers(householdId),
      this.prisma.expense.groupBy({
        by: ['paidById'],
        where: { householdId },
        _sum: { amountCents: true },
      }),
      this.prisma.expenseShare.groupBy({
        by: ['memberId'],
        where: { expense: { householdId } },
        _sum: { amountCents: true },
      }),
      this.prisma.expense.findMany({
        where: {
          householdId,
          kind: 'EXPENSE',
          date: monthRange(month),
          ...visibleTo(ctx.memberId),
        },
        include: { shares: true },
      }),
    ]);
    const paid = new Map(paidAll.map((p) => [p.paidById, p._sum.amountCents ?? 0]));
    const owed = new Map(sharesAll.map((s) => [s.memberId, s._sum.amountCents ?? 0]));
    const balance = (id: string) => (paid.get(id) ?? 0) - (owed.get(id) ?? 0);

    const monthPaid = new Map<string, number>();
    const monthShare = new Map<string, number>();
    const byCategory = new Map<ExpenseCategory, number>();
    let commonCents = 0;
    let mineCents = 0;
    for (const e of monthRows) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
      if (e.split !== 'PERSONAL') {
        monthPaid.set(e.paidById, (monthPaid.get(e.paidById) ?? 0) + e.amountCents);
      }
      if (e.split === 'SHARED') {
        commonCents += e.amountCents;
        for (const s of e.shares) {
          monthShare.set(s.memberId, (monthShare.get(s.memberId) ?? 0) + s.amountCents);
        }
      } else {
        mineCents += e.shares.find((s) => s.memberId === ctx.memberId)?.amountCents ?? 0;
      }
    }

    // Membres actifs, et anciens membres dont le solde n'est pas nul.
    const shown = members.filter((m) => m.leftAt === null || balance(m.id) !== 0);
    return {
      month,
      currency: EXPENSE_CURRENCY,
      commonCents,
      mineCents,
      members: shown.map((m) => ({
        memberId: m.id,
        weight: m.expenseWeight,
        balanceCents: balance(m.id),
        paidCents: monthPaid.get(m.id) ?? 0,
        shareCents: monthShare.get(m.id) ?? 0,
      })),
      transfers: settleTransfers(members.map((m) => ({ id: m.id, balance: balance(m.id) }))).map(
        (t) => ({ fromMemberId: t.from, toMemberId: t.to, amountCents: t.amount }),
      ),
      byCategory: [...byCategory.entries()]
        .map(([category, amountCents]) => ({ category, amountCents }))
        .sort((a, b) => b.amountCents - a.amountCents),
    };
  }

  async setWeights(ctx: HouseholdContext, input: ExpenseWeightsInput): Promise<void> {
    const members = await this.activeMembers(ctx.householdId);
    for (const w of input.weights) {
      if (!members.some((m) => m.id === w.memberId)) throw invalid('Unknown member');
    }
    await this.prisma.$transaction(
      input.weights.map((w) =>
        this.prisma.householdMember.update({
          where: { id: w.memberId },
          data: { expenseWeight: w.weight },
        }),
      ),
    );
    this.events.publish(ctx.householdId, 'expenses');
  }

  /** Parts de chacun : figées à l'enregistrement, leur somme vaut toujours le montant. */
  private computeShares(
    e: { paidById: string; amountCents: number; split: ExpenseSplit; forMemberId?: string | null },
    members: { id: string; expenseWeight: number }[],
  ): { memberId: string; amountCents: number }[] {
    const known = (id: string | null | undefined) => !!id && members.some((m) => m.id === id);
    if (!known(e.paidById)) throw invalid('Unknown payer');
    if (e.split === 'PERSONAL') return [{ memberId: e.paidById, amountCents: e.amountCents }];
    if (e.split === 'FOR_OTHER') {
      if (!known(e.forMemberId)) throw invalid('Unknown member');
      return [{ memberId: e.forMemberId!, amountCents: e.amountCents }];
    }
    const parts = splitCents(
      e.amountCents,
      members.map((m) => m.expenseWeight),
    );
    return members
      .map((m, i) => ({ memberId: m.id, amountCents: parts[i]! }))
      .filter((s) => s.amountCents > 0);
  }

  private async timezone(householdId: string): Promise<string> {
    const h = await this.prisma.household.findUniqueOrThrow({
      where: { id: householdId },
      select: { timezone: true },
    });
    return h.timezone;
  }

  private activeMembers(householdId: string) {
    return this.prisma.householdMember.findMany({
      where: { householdId, leftAt: null },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, expenseWeight: true },
    });
  }

  private allMembers(householdId: string) {
    return this.prisma.householdMember.findMany({
      where: { householdId },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, expenseWeight: true, leftAt: true },
    });
  }

  /** Dépense du foyer, visible de ce membre (une dépense personnelle d'un autre : introuvable). */
  private async find(ctx: HouseholdContext, id: string): Promise<ExpenseWithShares> {
    const expense = await this.prisma.expense.findFirst({
      where: { id, householdId: ctx.householdId, ...visibleTo(ctx.memberId) },
      include: { shares: true },
    });
    if (!expense) throw notFound();
    return expense;
  }
}
