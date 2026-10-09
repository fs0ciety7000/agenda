import type {
  ExpenseBudgetInput,
  ExpenseCategoryBudgetsInput,
  ExpenseDto,
  ExpenseInput,
  ExpenseStatsDto,
  ExpenseSummaryDto,
  ReceiptScanDto,
  RecurringExpenseDto,
  RecurringExpenseInput,
  ExpenseWeightsInput,
  SettleInput,
  UpdateExpenseInput,
} from '@agenda/contracts';
import { EXPENSE_CURRENCY } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter } from 'next-intl';
import { api } from './api';

export const expenseKeys = {
  all: (hid: string) => ['households', hid, 'expenses'] as const,
  month: (hid: string, month: string) => ['households', hid, 'expenses', month] as const,
  summary: (hid: string, month: string) =>
    ['households', hid, 'expenses', 'summary', month] as const,
  stats: (hid: string, month: string, months: number) =>
    ['households', hid, 'expenses', 'stats', month, months] as const,
};

export const useExpenses = (hid: string, month: string) =>
  useQuery({
    queryKey: expenseKeys.month(hid, month),
    queryFn: () => api<ExpenseDto[]>(`/v1/households/${hid}/expenses?month=${month}`),
  });

export const useExpenseSummary = (hid: string, month: string) =>
  useQuery({
    queryKey: expenseKeys.summary(hid, month),
    queryFn: () => api<ExpenseSummaryDto>(`/v1/households/${hid}/expenses/summary?month=${month}`),
  });

/** Évolution sur `months` mois, jusqu'à `month` compris. */
export const useExpenseStats = (hid: string, month: string, months = 6) =>
  useQuery({
    queryKey: expenseKeys.stats(hid, month, months),
    queryFn: () =>
      api<ExpenseStatsDto>(`/v1/households/${hid}/expenses/stats?month=${month}&months=${months}`),
  });

/** Fichier CSV des dépenses de `from` à `to` (téléchargé par le navigateur, cookie compris). */
export const exportUrl = (hid: string, from: string, to: string) =>
  `/v1/households/${hid}/expenses/export?from=${from}&to=${to}`;

export const useRecurringExpenses = (hid: string) =>
  useQuery({
    queryKey: [...expenseKeys.all(hid), 'recurring'],
    queryFn: () => api<RecurringExpenseDto[]>(`/v1/households/${hid}/expenses/recurring`),
  });

/** Adresse du ticket d'une dépense (ouvert dans un nouvel onglet). */
export const receiptUrl = (hid: string, id: string) =>
  `/v1/households/${hid}/expenses/${id}/receipt`;

export function useExpenseActions(hid: string) {
  const qc = useQueryClient();
  const base = `/v1/households/${hid}/expenses`;
  const invalidate = () => qc.invalidateQueries({ queryKey: expenseKeys.all(hid) });
  return {
    /** Nouvelle dépense (`editingId` absent) ou modification. */
    save: useMutation({
      mutationFn: ({ editingId, input }: { editingId?: string; input: ExpenseInput }) =>
        editingId
          ? api<ExpenseDto>(`${base}/${editingId}`, {
              method: 'PATCH',
              json: {
                paidById: input.paidById,
                amountCents: input.amountCents,
                date: input.date,
                title: input.title,
                category: input.category,
                split: input.split,
                forMemberId: input.forMemberId ?? null,
                note: input.note ?? null,
                shares: input.shares ?? null,
              } satisfies UpdateExpenseInput,
            })
          : api<ExpenseDto>(base, { method: 'POST', json: input }),
      onSettled: invalidate,
    }),
    settle: useMutation({
      mutationFn: (input: SettleInput) =>
        api<ExpenseDto>(`${base}/settle`, { method: 'POST', json: input }),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
      onSettled: invalidate,
    }),
    createRecurring: useMutation({
      mutationFn: (input: RecurringExpenseInput) =>
        api<RecurringExpenseDto>(`${base}/recurring`, { method: 'POST', json: input }),
      onSettled: invalidate,
    }),
    stopRecurring: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/recurring/${id}`, { method: 'DELETE' }),
      onSettled: invalidate,
    }),
    uploadReceipt: useMutation({
      mutationFn: ({ id, file }: { id: string; file: File }) => {
        const body = new FormData();
        body.append('file', file);
        return api<ExpenseDto>(`${base}/${id}/receipt`, { method: 'POST', body });
      },
      onSettled: invalidate,
    }),
    // Lecture d'une photo de ticket sur le serveur (rien n'est enregistré).
    scanReceipt: useMutation({
      mutationFn: (file: File) => {
        const body = new FormData();
        body.append('file', file);
        return api<ReceiptScanDto>(`${base}/receipt/scan`, { method: 'POST', body });
      },
    }),
    removeReceipt: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}/receipt`, { method: 'DELETE' }),
      onSettled: invalidate,
    }),
    budget: useMutation({
      mutationFn: (input: ExpenseBudgetInput) =>
        api<void>(`${base}/budget`, { method: 'PUT', json: input }),
      onSettled: invalidate,
    }),
    categoryBudgets: useMutation({
      mutationFn: (input: ExpenseCategoryBudgetsInput) =>
        api<void>(`${base}/budget/categories`, { method: 'PUT', json: input }),
      onSettled: invalidate,
    }),
    weights: useMutation({
      mutationFn: (input: ExpenseWeightsInput) =>
        api<void>(`${base}/weights`, { method: 'PUT', json: input }),
      onSettled: invalidate,
    }),
  };
}

/** « 42,50 € » dans la langue de l'interface. */
export function useMoney() {
  const format = useFormatter();
  return (cents: number) =>
    format.number(cents / 100, { style: 'currency', currency: EXPENSE_CURRENCY });
}

/**
 * Tâche qui ressemble à un paiement (« Payer la facture », « Pay rent », « Huur betalen »…), ou
 * rangée dans la catégorie 💰 : en la cochant, on propose de noter la dépense.
 */
export function looksLikePayment(title: string, categoryEmoji?: string | null): boolean {
  if (categoryEmoji === '💰') return true;
  return /\b(payer|payez|paye|pay|paid|factures?|bill|rent|loyer|betalen|betaal|factuur|huur|rembourser)\b/i.test(
    title.normalize('NFD').replace(/\p{M}/gu, ''),
  );
}

/** Lien qui ouvre le formulaire de dépense prérempli. */
export const newExpenseHref = (prefill: { title?: string; category?: string }) => {
  const q = new URLSearchParams({ new: '1' });
  if (prefill.title) q.set('title', prefill.title);
  if (prefill.category) q.set('category', prefill.category);
  return `/expenses?${q}`;
};

/** Nombre de mois de `from` à `to` inclus (« 2026-01 » → « 2026-10 » : 10). */
export function monthSpan(from: string, to: string): number {
  const n = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  return n(to) - n(from) + 1;
}

/** Seuil d'alerte atteint : 100, 80 ou 0 (comme l'API). */
export function budgetLevel(spentCents: number, budgetCents: number | null): 0 | 80 | 100 {
  if (!budgetCents) return 0;
  if (spentCents >= budgetCents) return 100;
  return spentCents * 5 >= budgetCents * 4 ? 80 : 0;
}

/** « 2026-10 » → mois précédent / suivant. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
