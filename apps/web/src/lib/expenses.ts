import type {
  ExpenseDto,
  ExpenseInput,
  ExpenseSummaryDto,
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

/** « 2026-10 » → mois précédent / suivant. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
