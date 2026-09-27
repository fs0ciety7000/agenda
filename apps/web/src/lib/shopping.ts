'use client';

import type { ShoppingItemDto } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import {
  offlineKeys,
  type ShopAddVars,
  type ShopClearVars,
  type ShopRemoveVars,
  type ShopUpdateVars,
} from './offline';
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

/**
 * Toutes les actions sont affichées immédiatement, puis confirmées (annulées en cas d'erreur).
 * Hors ligne, elles sont mises en file et envoyées au retour du réseau (cf. lib/offline.ts).
 */
export function useShoppingActions(hid: string, memberId: string) {
  const qc = useQueryClient();
  const key = shoppingKey(hid);
  type Ctx = { previous?: ShoppingItemDto[] };
  const optimistic = async (
    update: (list: ShoppingItemDto[]) => ShoppingItemDto[],
  ): Promise<Ctx> => {
    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData<ShoppingItemDto[]>(key);
    qc.setQueryData<ShoppingItemDto[]>(key, (list) => sorted(update(list ?? [])));
    return { previous };
  };
  const common = {
    onError: (_e: unknown, _v: unknown, ctx?: Ctx) => qc.setQueryData(key, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  };
  const add = useMutation<ShoppingItemDto[], Error, ShopAddVars, Ctx>({
    mutationKey: offlineKeys.shopAdd,
    onMutate: ({ items }) => {
      const now = new Date().toISOString();
      return optimistic((list) => [
        ...list,
        ...items.map(({ id, text }) => ({
          id,
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
  });
  const update = useMutation<ShoppingItemDto, Error, ShopUpdateVars, Ctx>({
    mutationKey: offlineKeys.shopUpdate,
    onMutate: ({ id, done, text }) =>
      optimistic((list) =>
        list.map((i) =>
          i.id !== id
            ? i
            : {
                ...i,
                ...(text !== undefined ? { text } : {}),
                ...(done !== undefined
                  ? {
                      done,
                      doneById: done ? memberId : null,
                      doneAt: done ? new Date().toISOString() : null,
                    }
                  : {}),
              },
        ),
      ),
    ...common,
  });
  const remove = useMutation<void, Error, ShopRemoveVars, Ctx>({
    mutationKey: offlineKeys.shopRemove,
    onMutate: ({ id }) => optimistic((list) => list.filter((i) => i.id !== id)),
    ...common,
  });
  const clearDone = useMutation<void, Error, ShopClearVars, Ctx>({
    mutationKey: offlineKeys.shopClear,
    onMutate: () => optimistic((list) => list.filter((i) => !i.done)),
    ...common,
  });
  return {
    add: {
      ...add,
      mutate: (texts: string[]) =>
        add.mutate({ hid, items: texts.map((text) => ({ id: crypto.randomUUID(), text })) }),
    },
    toggle: {
      ...update,
      mutate: ({ id, done }: { id: string; done: boolean }) => update.mutate({ hid, id, done }),
    },
    rename: {
      ...update,
      mutate: ({ id, text }: { id: string; text: string }) => update.mutate({ hid, id, text }),
    },
    remove: { ...remove, mutate: (id: string) => remove.mutate({ hid, id }) },
    clearDone: { ...clearDone, mutate: () => clearDone.mutate({ hid }) },
  };
}

/** « lait, pain ; œufs » ou une ligne par article → plusieurs articles d'un coup. */
export const splitItems = (text: string) =>
  text
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.slice(0, 200));
