import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Expense, type ExpenseShare, type RecurringExpense } from '@prisma/client';
import {
  ATTACHMENT_MAX_BYTES,
  EXPENSE_CURRENCY,
  type ExpenseCategory,
  type ExpenseDto,
  type ExpenseInput,
  type ExpenseMonthStats,
  type ExpenseSplit,
  type ExpenseStatsDto,
  type ExpenseSummaryDto,
  type ExpenseWeightsInput,
  HOUSEHOLD_ATTACHMENTS_MAX_BYTES,
  RECEIPT_TYPES,
  type RecurringExpenseDto,
  type RecurringExpenseInput,
  type SettleInput,
  type UpdateExpenseInput,
} from '@agenda/contracts';
import { daysInMonth, settleTransfers, splitCents, todayIn } from '@agenda/domain';
import { mailLocale } from '../mail/templates';
import { NotificationsService } from '../notifications/notifications.service';
import { safeFilename } from '../tasks/attachments.service';
import { expensesCsv } from './expenses-csv';
import { AppException, notFound } from '../common/app-exception';
import { fromDbDate, toDbDate } from '../common/dates';
import { DomainEvents } from '../common/domain-events';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

type ExpenseWithShares = Expense & {
  shares: ExpenseShare[];
  receipt: { expenseId: string } | null;
};

/** Toujours lu avec ses parts et la présence d'un ticket (pas son contenu). */
const INCLUDE = { shares: true, receipt: { select: { expenseId: true } } } as const;

type Share = { memberId: string; amountCents: number };

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
  hasReceipt: e.receipt !== null,
  recurringId: e.recurringId,
  createdById: e.createdById,
  createdAt: e.createdAt.toISOString(),
});

const toRecurringDto = (r: RecurringExpense): RecurringExpenseDto => ({
  id: r.id,
  paidById: r.paidById,
  amountCents: r.amountCents,
  title: r.title,
  category: r.category,
  split: r.split,
  forMemberId: r.forMemberId,
  note: r.note,
  dayOfMonth: r.dayOfMonth,
  startDate: fromDbDate(r.startDate)!,
});

/** « 2026-10 » + n mois. */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Échéance d'une charge fixe pour un mois : son jour, ou le dernier jour d'un mois plus court. */
function dueDate(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`;
}

/** Premier et dernier jour d'un mois « 2026-10 ». */
function monthRange(month: string): { gte: Date; lte: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lte: new Date(Date.UTC(y, m, 0)) };
}

/** Dépense commune : partagée selon les proportions ou à la main. */
const isCommon = (split: ExpenseSplit) => split === 'SHARED' || split === 'CUSTOM';

/** Totaux d'un mois : commun, « pour moi » (perso et avancé pour moi), par catégorie. */
function monthTotals(
  month: string,
  rows: (Expense & { shares: ExpenseShare[] })[],
  memberId: string,
): ExpenseMonthStats {
  const byCategory = new Map<ExpenseCategory, number>();
  let commonCents = 0;
  let mineCents = 0;
  for (const e of rows) {
    if (e.kind !== 'EXPENSE') continue;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
    if (isCommon(e.split)) commonCents += e.amountCents;
    else mineCents += e.shares.find((s) => s.memberId === memberId)?.amountCents ?? 0;
  }
  return {
    month,
    commonCents,
    mineCents,
    byCategory: [...byCategory.entries()]
      .map(([category, amountCents]) => ({ category, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents),
  };
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
    private readonly notifications: NotificationsService,
  ) {}

  async list(ctx: HouseholdContext, month: string): Promise<ExpenseDto[]> {
    await this.materialize(ctx.householdId);
    const rows = await this.prisma.expense.findMany({
      where: { householdId: ctx.householdId, date: monthRange(month), ...visibleTo(ctx.memberId) },
      include: INCLUDE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toDto);
  }

  async create(ctx: HouseholdContext, input: ExpenseInput): Promise<ExpenseDto> {
    if (input.id) {
      const existing = await this.prisma.expense.findUnique({
        where: { id: input.id },
        include: INCLUDE,
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
      include: INCLUDE,
    });
    this.events.publish(ctx.householdId, 'expenses');
    await this.checkBudget(ctx.householdId, ctx.memberId);
    return toDto(expense);
  }

  async settle(ctx: HouseholdContext, input: SettleInput): Promise<ExpenseDto> {
    if (input.id) {
      const existing = await this.prisma.expense.findUnique({
        where: { id: input.id },
        include: INCLUDE,
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
      include: INCLUDE,
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
      input.forMemberId !== undefined ||
      input.shares !== undefined;
    // Parts à la main : celles envoyées, sinon les actuelles si le montant n'a pas changé.
    const custom =
      input.shares ??
      (current.split === 'CUSTOM' && input.amountCents === undefined ? current.shares : null);
    const shares = sharesChanged
      ? this.computeShares({ ...next, shares: custom }, await this.activeMembers(ctx.householdId))
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
        include: INCLUDE,
      });
    });
    this.events.publish(ctx.householdId, 'expenses');
    await this.checkBudget(ctx.householdId, ctx.memberId);
    return toDto(expense);
  }

  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    await this.find(ctx, id);
    await this.prisma.expense.delete({ where: { id } });
    this.events.publish(ctx.householdId, 'expenses');
  }

  async summary(ctx: HouseholdContext, month: string): Promise<ExpenseSummaryDto> {
    const householdId = ctx.householdId;
    await this.materialize(householdId);
    const [members, paidAll, sharesAll, monthRows, household] = await Promise.all([
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
        include: INCLUDE,
      }),
      this.prisma.household.findUniqueOrThrow({
        where: { id: householdId },
        select: { expenseBudgetCents: true },
      }),
    ]);
    const paid = new Map(paidAll.map((p) => [p.paidById, p._sum.amountCents ?? 0]));
    const owed = new Map(sharesAll.map((s) => [s.memberId, s._sum.amountCents ?? 0]));
    const balance = (id: string) => (paid.get(id) ?? 0) - (owed.get(id) ?? 0);

    const monthPaid = new Map<string, number>();
    const monthShare = new Map<string, number>();
    for (const e of monthRows) {
      if (e.split !== 'PERSONAL') {
        monthPaid.set(e.paidById, (monthPaid.get(e.paidById) ?? 0) + e.amountCents);
      }
      if (isCommon(e.split)) {
        for (const s of e.shares) {
          monthShare.set(s.memberId, (monthShare.get(s.memberId) ?? 0) + s.amountCents);
        }
      }
    }
    const totals = monthTotals(month, monthRows, ctx.memberId);

    // Membres actifs, et anciens membres dont le solde n'est pas nul.
    const shown = members.filter((m) => m.leftAt === null || balance(m.id) !== 0);
    return {
      month,
      currency: EXPENSE_CURRENCY,
      commonCents: totals.commonCents,
      mineCents: totals.mineCents,
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
      byCategory: totals.byCategory,
      budgetCents: household.expenseBudgetCents,
    };
  }

  /** Évolution mois par mois (du plus ancien au plus récent), jusqu'à `month` compris. */
  async stats(ctx: HouseholdContext, month: string, months: number): Promise<ExpenseStatsDto> {
    await this.materialize(ctx.householdId);
    const from = addMonths(month, -(months - 1));
    const [rows, household] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          householdId: ctx.householdId,
          kind: 'EXPENSE',
          date: { gte: monthRange(from).gte, lte: monthRange(month).lte },
          ...visibleTo(ctx.memberId),
        },
        include: { shares: true },
      }),
      this.prisma.household.findUniqueOrThrow({
        where: { id: ctx.householdId },
        select: { expenseBudgetCents: true },
      }),
    ]);
    const list = Array.from({ length: months }, (_, i) => addMonths(from, i));
    return {
      currency: EXPENSE_CURRENCY,
      budgetCents: household.expenseBudgetCents,
      months: list.map((m) =>
        monthTotals(
          m,
          rows.filter((e) => fromDbDate(e.date)!.startsWith(m)),
          ctx.memberId,
        ),
      ),
    };
  }

  /** Budget mensuel des dépenses communes (null = aucun). */
  async setBudget(ctx: HouseholdContext, budgetCents: number | null): Promise<void> {
    await this.prisma.household.update({
      where: { id: ctx.householdId },
      data: { expenseBudgetCents: budgetCents },
    });
    this.events.publish(ctx.householdId, 'expenses');
    await this.checkBudget(ctx.householdId, ctx.memberId);
  }

  /**
   * Export tableur, dans la langue de la personne : une ligne par dépense ou remboursement, avec
   * la part de chacun. Ses dépenses personnelles y sont, pas celles des autres.
   */
  async exportCsv(
    ctx: HouseholdContext,
    from: string,
    to: string,
  ): Promise<{ filename: string; body: string }> {
    await this.materialize(ctx.householdId);
    const [rows, members, me] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          householdId: ctx.householdId,
          date: { gte: monthRange(from).gte, lte: monthRange(to).lte },
          ...visibleTo(ctx.memberId),
        },
        include: { shares: true },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.householdMember.findMany({
        where: { householdId: ctx.householdId },
        orderBy: { joinedAt: 'asc' },
        select: { id: true, displayName: true, leftAt: true },
      }),
      this.prisma.householdMember.findUniqueOrThrow({
        where: { id: ctx.memberId },
        select: { user: { select: { locale: true } } },
      }),
    ]);
    return expensesCsv(mailLocale(me.user?.locale), from, to, rows, members);
  }

  /**
   * Alerte budget : à 80 % puis à 100 % des dépenses communes du mois en cours (une fois par
   * seuil). Une alerte qui échoue ne fait jamais échouer l'enregistrement.
   */
  private async checkBudget(householdId: string, actorMemberId: string | null): Promise<void> {
    try {
      const household = await this.prisma.household.findUniqueOrThrow({
        where: { id: householdId },
        select: { expenseBudgetCents: true, timezone: true },
      });
      const budgetCents = household.expenseBudgetCents;
      if (!budgetCents) return;
      const month = todayIn(household.timezone).slice(0, 7);
      const spent = await this.prisma.expense.aggregate({
        where: {
          householdId,
          kind: 'EXPENSE',
          split: { in: ['SHARED', 'CUSTOM'] },
          date: monthRange(month),
        },
        _sum: { amountCents: true },
      });
      const amountCents = spent._sum.amountCents ?? 0;
      const level = amountCents >= budgetCents ? 100 : amountCents * 5 >= budgetCents * 4 ? 80 : 0;
      if (!level) return;
      await this.notifications.notifyBudget(householdId, actorMemberId, {
        month,
        level,
        amountCents,
        budgetCents,
      });
    } catch {
      // Notification manquée : la dépense est enregistrée, c'est l'essentiel.
    }
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
    e: {
      paidById: string;
      amountCents: number;
      split: ExpenseSplit;
      forMemberId?: string | null;
      shares?: Share[] | null;
    },
    members: { id: string; expenseWeight: number }[],
  ): Share[] {
    const known = (id: string | null | undefined) => !!id && members.some((m) => m.id === id);
    if (!known(e.paidById)) throw invalid('Unknown payer');
    if (e.split === 'CUSTOM') {
      const shares = (e.shares ?? []).filter((x) => x.amountCents > 0);
      if (!shares.length || shares.reduce((a, x) => a + x.amountCents, 0) !== e.amountCents) {
        throw invalid('shares must add up to amountCents');
      }
      if (shares.some((x) => !known(x.memberId))) throw invalid('Unknown member');
      if (new Set(shares.map((x) => x.memberId)).size !== shares.length) {
        throw invalid('Duplicate member in shares');
      }
      return shares.map((x) => ({ memberId: x.memberId, amountCents: x.amountCents }));
    }
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

  // ───────────── Charges fixes ─────────────

  async listRecurring(ctx: HouseholdContext): Promise<RecurringExpenseDto[]> {
    const rows = await this.prisma.recurringExpense.findMany({
      where: {
        householdId: ctx.householdId,
        endedAt: null,
        OR: [{ split: { not: 'PERSONAL' } }, { paidById: ctx.memberId }],
      },
      orderBy: [{ dayOfMonth: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRecurringDto);
  }

  /** Créer une charge fixe ; l'échéance du mois en cours (si passée) est créée tout de suite. */
  async createRecurring(
    ctx: HouseholdContext,
    input: RecurringExpenseInput,
  ): Promise<RecurringExpenseDto> {
    // Valide le payeur, le bénéficiaire et le partage avec les membres actuels.
    this.computeShares(input, await this.activeMembers(ctx.householdId));
    const recurring = await this.prisma.recurringExpense.create({
      data: {
        householdId: ctx.householdId,
        paidById: input.paidById,
        amountCents: input.amountCents,
        title: input.title,
        category: input.category,
        split: input.split,
        forMemberId: input.split === 'FOR_OTHER' ? input.forMemberId! : null,
        note: input.note || null,
        dayOfMonth: Number(input.startDate.slice(8, 10)),
        startDate: toDbDate(input.startDate),
        createdById: ctx.memberId,
      },
    });
    await this.materialize(ctx.householdId);
    this.events.publish(ctx.householdId, 'expenses');
    return toRecurringDto(recurring);
  }

  /** Arrêter une charge fixe : plus rien n'est créé, les dépenses déjà créées restent. */
  async stopRecurring(ctx: HouseholdContext, id: string): Promise<void> {
    const stopped = await this.prisma.recurringExpense.updateMany({
      where: {
        id,
        householdId: ctx.householdId,
        endedAt: null,
        OR: [{ split: { not: 'PERSONAL' } }, { paidById: ctx.memberId }],
      },
      data: { endedAt: new Date() },
    });
    if (!stopped.count) throw notFound();
    this.events.publish(ctx.householdId, 'expenses');
  }

  /**
   * Crée les échéances dues des charges fixes, jusqu'à aujourd'hui (fuseau du foyer). Appelé à
   * chaque lecture : pas de tâche planifiée à surveiller. L'index unique (charge, mois) empêche
   * les doublons si deux lectures se croisent.
   */
  private async materialize(householdId: string): Promise<void> {
    const rules = await this.prisma.recurringExpense.findMany({
      where: { householdId, endedAt: null },
    });
    if (!rules.length) return;
    const today = todayIn(await this.timezone(householdId));
    const thisMonth = today.slice(0, 7);
    const members = await this.activeMembers(householdId);
    let created = false;
    for (const rule of rules) {
      const start = fromDbDate(rule.startDate)!;
      let month = rule.lastMonth ? addMonths(rule.lastMonth, 1) : start.slice(0, 7);
      while (month <= thisMonth) {
        const date = dueDate(month, rule.dayOfMonth);
        if (date > today) break;
        if (date >= start) {
          let shares: Share[];
          try {
            shares = this.computeShares(rule, members);
          } catch {
            // Payeur ou bénéficiaire parti du foyer : la charge s'arrête d'elle-même.
            await this.prisma.recurringExpense.update({
              where: { id: rule.id },
              data: { endedAt: new Date() },
            });
            break;
          }
          try {
            await this.prisma.expense.create({
              data: {
                householdId,
                paidById: rule.paidById,
                amountCents: rule.amountCents,
                date: toDbDate(date),
                title: rule.title,
                category: rule.category,
                split: rule.split,
                forMemberId: rule.forMemberId,
                note: rule.note,
                createdById: rule.createdById,
                recurringId: rule.id,
                recurringMonth: month,
                shares: { create: shares },
              },
            });
            created = true;
          } catch (e) {
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
          }
        }
        await this.prisma.recurringExpense.update({
          where: { id: rule.id },
          data: { lastMonth: month },
        });
        month = addMonths(month, 1);
      }
    }
    if (created) {
      this.events.publish(householdId, 'expenses');
      await this.checkBudget(householdId, null);
    }
  }

  // ───────────── Tickets ─────────────

  async addReceipt(
    ctx: HouseholdContext,
    id: string,
    file: { filename: string; contentType: string; data: Buffer },
  ): Promise<ExpenseDto> {
    const expense = await this.find(ctx, id);
    if (!RECEIPT_TYPES.includes(file.contentType.toLowerCase())) {
      throw invalid('Receipt must be an image or a PDF');
    }
    if (file.data.length > ATTACHMENT_MAX_BYTES) {
      throw new AppException(
        'ATTACHMENT_TOO_LARGE',
        HttpStatus.PAYLOAD_TOO_LARGE,
        'File too large',
      );
    }
    // Même quota que les pièces jointes des tâches (tout le stockage du foyer).
    const [tasks, receipts] = await Promise.all([
      this.prisma.taskAttachment.aggregate({
        where: { householdId: ctx.householdId },
        _sum: { size: true },
      }),
      this.prisma.expenseReceipt.aggregate({
        where: { householdId: ctx.householdId, expenseId: { not: id } },
        _sum: { size: true },
      }),
    ]);
    const used = (tasks._sum.size ?? 0) + (receipts._sum.size ?? 0);
    if (used + file.data.length > HOUSEHOLD_ATTACHMENTS_MAX_BYTES) {
      throw new AppException('ATTACHMENTS_QUOTA', HttpStatus.PAYLOAD_TOO_LARGE, 'Quota exceeded');
    }
    const data = {
      householdId: ctx.householdId,
      filename: safeFilename(file.filename),
      contentType: file.contentType.toLowerCase(),
      size: file.data.length,
      data: new Uint8Array(file.data),
      createdById: ctx.memberId,
    };
    await this.prisma.expenseReceipt.upsert({
      where: { expenseId: expense.id },
      create: { expenseId: expense.id, ...data },
      update: data,
    });
    this.events.publish(ctx.householdId, 'expenses');
    return toDto(await this.find(ctx, id));
  }

  async getReceipt(ctx: HouseholdContext, id: string) {
    await this.find(ctx, id);
    const receipt = await this.prisma.expenseReceipt.findUnique({ where: { expenseId: id } });
    if (!receipt) throw notFound();
    return receipt;
  }

  async removeReceipt(ctx: HouseholdContext, id: string): Promise<void> {
    await this.find(ctx, id);
    await this.prisma.expenseReceipt.deleteMany({ where: { expenseId: id } });
    this.events.publish(ctx.householdId, 'expenses');
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
      include: INCLUDE,
    });
    if (!expense) throw notFound();
    return expense;
  }
}
