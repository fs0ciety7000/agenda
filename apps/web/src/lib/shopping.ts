'use client';

import type { ShoppingItemDto } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { pollInterval } from './realtime';

export const shoppingKey = (hid: string) => ['households', hid, 'shopping'] as const;

/** Tri de l'API : à acheter (ordre d'ajout), puis déjà pris (les plus récents d'abord). */
const sorted = (items: ShoppingItemDto[]) => [
  ...items.filter((i) => !i.done).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  ...items.filter((i) => i.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
];

export const useShopping = (hid: string) =>
  useQuery({
    queryKey: shoppingKey(hid),
    queryFn: () => api<ShoppingItemDto[]>(`/v1/households/${hid}/shopping`),
    refetchInterval: () => pollInterval(15_000),
  });

/** Toutes les actions sont affichées immédiatement, puis confirmées (annulées en cas d'erreur). */
export function useShoppingActions(hid: string, memberId: string) {
  const qc = useQueryClient();
  const key = shoppingKey(hid);
  const base = `/v1/households/${hid}/shopping`;
  const optimistic = async (update: (list: ShoppingItemDto[]) => ShoppingItemDto[]) => {
    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData<ShoppingItemDto[]>(key);
    qc.setQueryData<ShoppingItemDto[]>(key, (list) => sorted(update(list ?? [])));
    return { previous };
  };
  const common = {
    onError: (_e: unknown, _v: unknown, ctx?: { previous?: ShoppingItemDto[] }) =>
      qc.setQueryData(key, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  };
  return {
    add: useMutation({
      mutationFn: (texts: string[]) =>
        Promise.all(
          texts.map((text) =>
            api<ShoppingItemDto>(base, { method: 'POST', json: { id: crypto.randomUUID(), text } }),
          ),
        ),
      onMutate: (texts) => {
        const now = new Date().toISOString();
        return optimistic((list) => [
          ...list,
          ...texts.map((text, i) => ({
            id: `pending-${now}-${i}`,
            text,
            done: false,
            createdById: memberId,
            doneById: null,
            createdAt: now,
            doneAt: null,
          })),
        ]);
      },
      ...common,
    }),
    toggle: useMutation({
      mutationFn: ({ id, done }: { id: string; done: boolean }) =>
        api<ShoppingItemDto>(`${base}/${id}`, { method: 'PATCH', json: { done } }),
      onMutate: ({ id, done }) =>
        optimistic((list) =>
          list.map((i) =>
            i.id === id
              ? {
                  ...i,
                  done,
                  doneById: done ? memberId : null,
                  doneAt: done ? new Date().toISOString() : null,
                }
              : i,
          ),
        ),
      ...common,
    }),
    rename: useMutation({
      mutationFn: ({ id, text }: { id: string; text: string }) =>
        api<ShoppingItemDto>(`${base}/${id}`, { method: 'PATCH', json: { text } }),
      onMutate: ({ id, text }) =>
        optimistic((list) => list.map((i) => (i.id === id ? { ...i, text } : i))),
      ...common,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
      onMutate: (id) => optimistic((list) => list.filter((i) => i.id !== id)),
      ...common,
    }),
    clearDone: useMutation({
      mutationFn: () => api<void>(`${base}/clear-done`, { method: 'POST' }),
      onMutate: () => optimistic((list) => list.filter((i) => !i.done)),
      ...common,
    }),
  };
}

/** « lait, pain ; œufs » ou une ligne par article → plusieurs articles d'un coup. */
export const splitItems = (text: string) =>
  text
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.slice(0, 200));
