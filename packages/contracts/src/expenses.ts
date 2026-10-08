import { z } from 'zod';
import { IsoDate } from './tasks';

/**
 * Dépenses du foyer : qui a payé quoi, la part de chacun, et le solde (qui doit combien à qui).
 * Montants en centimes entiers (pas d'arrondi flottant), en euros.
 */
export const EXPENSE_CURRENCY = 'EUR';
/** 100 000 € : au-delà, c'est presque sûrement une faute de frappe. */
export const MAX_EXPENSE_CENTS = 10_000_000;

export const ExpenseCategory = z.enum([
  'GROCERIES',
  'HOUSING',
  'UTILITIES',
  'TRANSPORT',
  'LEISURE',
  'HEALTH',
  'KIDS',
  'GIFTS',
  'OTHER',
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

/**
 * - SHARED : dépense commune, partagée selon les proportions du foyer (50/50 par défaut) ;
 * - FOR_OTHER : avancée pour quelqu'un d'autre, qui en doit la totalité ;
 * - PERSONAL : pour soi seul, visible de soi seul (n'entre pas dans le solde).
 */
export const ExpenseSplit = z.enum(['SHARED', 'FOR_OTHER', 'PERSONAL']);
export type ExpenseSplit = z.infer<typeof ExpenseSplit>;

/** EXPENSE : une dépense ; SETTLEMENT : un remboursement d'un membre à un autre. */
export const ExpenseKind = z.enum(['EXPENSE', 'SETTLEMENT']);
export type ExpenseKind = z.infer<typeof ExpenseKind>;

const Cents = z.number().int().min(1).max(MAX_EXPENSE_CENTS);
/** « 2026-10 » */
export const IsoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const ExpenseShareDto = z.object({ memberId: z.uuid(), amountCents: z.number().int() });
export type ExpenseShareDto = z.infer<typeof ExpenseShareDto>;

export const ExpenseDto = z.object({
  id: z.uuid(),
  kind: ExpenseKind,
  paidById: z.uuid(),
  amountCents: z.number().int(),
  date: IsoDate,
  title: z.string(),
  category: ExpenseCategory,
  split: ExpenseSplit,
  /** FOR_OTHER : la personne pour qui c'était ; SETTLEMENT : la personne remboursée. */
  forMemberId: z.uuid().nullable(),
  note: z.string().nullable(),
  shares: z.array(ExpenseShareDto),
  createdById: z.uuid().nullable(),
  createdAt: z.string(),
});
export type ExpenseDto = z.infer<typeof ExpenseDto>;

export const ExpenseInput = z
  .object({
    /** Identifiant choisi par l'appareil : un envoi répété (hors ligne) ne crée pas de doublon. */
    id: z.uuid().optional(),
    paidById: z.uuid(),
    amountCents: Cents,
    date: IsoDate,
    title: z.string().trim().min(1).max(120),
    category: ExpenseCategory.default('OTHER'),
    split: ExpenseSplit.default('SHARED'),
    forMemberId: z.uuid().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.split !== 'FOR_OTHER' || (v.forMemberId && v.forMemberId !== v.paidById), {
    message: 'forMemberId is required and must differ from paidById',
    path: ['forMemberId'],
  });
export type ExpenseInput = z.infer<typeof ExpenseInput>;

export const UpdateExpenseInput = z
  .object({
    paidById: z.uuid(),
    amountCents: Cents,
    date: IsoDate,
    title: z.string().trim().min(1).max(120),
    category: ExpenseCategory,
    split: ExpenseSplit,
    forMemberId: z.uuid().nullable(),
    note: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'nothing to update' });
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseInput>;

/** Rembourser : « Nicolas rend 42,50 € à Grace ». */
export const SettleInput = z
  .object({
    id: z.uuid().optional(),
    fromMemberId: z.uuid(),
    toMemberId: z.uuid(),
    amountCents: Cents,
    date: IsoDate.optional(),
  })
  .refine((v) => v.fromMemberId !== v.toMemberId, {
    message: 'fromMemberId and toMemberId must differ',
    path: ['toMemberId'],
  });
export type SettleInput = z.infer<typeof SettleInput>;

export const ExpensesQuery = z.object({ month: IsoMonth });
export type ExpensesQuery = z.infer<typeof ExpensesQuery>;

export const ExpenseMemberSummary = z.object({
  memberId: z.uuid(),
  /** Proportion de partage des dépenses communes (poids relatif, 1 à 100). */
  weight: z.number().int(),
  /** Solde depuis le début : > 0 on lui doit, < 0 il doit. */
  balanceCents: z.number().int(),
  /** Mois : ce qu'il a payé (dépenses communes et avancées, hors remboursements). */
  paidCents: z.number().int(),
  /** Mois : sa part des dépenses communes. */
  shareCents: z.number().int(),
});
export type ExpenseMemberSummary = z.infer<typeof ExpenseMemberSummary>;

/** Pour solder : qui rend combien à qui (au plus n − 1 virements). */
export const ExpenseTransfer = z.object({
  fromMemberId: z.uuid(),
  toMemberId: z.uuid(),
  amountCents: z.number().int(),
});
export type ExpenseTransfer = z.infer<typeof ExpenseTransfer>;

export const ExpenseSummaryDto = z.object({
  month: IsoMonth,
  currency: z.string(),
  /** Mois : total des dépenses communes. */
  commonCents: z.number().int(),
  /** Mois : mes dépenses personnelles et celles avancées pour moi (visibles de moi seul). */
  mineCents: z.number().int(),
  members: z.array(ExpenseMemberSummary),
  transfers: z.array(ExpenseTransfer),
  byCategory: z.array(z.object({ category: ExpenseCategory, amountCents: z.number().int() })),
});
export type ExpenseSummaryDto = z.infer<typeof ExpenseSummaryDto>;

export const ExpenseWeightsInput = z.object({
  weights: z
    .array(z.object({ memberId: z.uuid(), weight: z.number().int().min(1).max(100) }))
    .min(1)
    .max(20),
});
export type ExpenseWeightsInput = z.infer<typeof ExpenseWeightsInput>;
