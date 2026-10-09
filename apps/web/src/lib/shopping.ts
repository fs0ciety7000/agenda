'use client';

import type {
  Aisle,
  BarcodeLookupDto,
  GuestShoppingLinkDto,
  ShoppingItemDto,
  ShoppingSuggestionDto,
} from '@agenda/contracts';
import { guessAisle, parseShoppingText } from '@agenda/domain';
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

/** Produits souvent achetés, absents de la liste (proposés en un geste). */
export const useShoppingSuggestions = (hid: string) =>
  useQuery({
    queryKey: [...shoppingKey(hid), 'suggestions'],
    queryFn: () => api<ShoppingSuggestionDto[]>(`/v1/households/${hid}/shopping/suggestions`),
  });

/** Durée d'un lien invité (jours) ; null = sans limite. */
export type GuestLinkDays = 1 | 7 | 30 | null;

/** Lien invité (lecture seule) : un par foyer ; rechargé avec la liste (sujet temps réel `shopping`). */
export function useGuestShoppingLink(hid: string) {
  const qc = useQueryClient();
  const key = [...shoppingKey(hid), 'guest'];
  const base = `/v1/households/${hid}/shopping-guest`;
  const link = useQuery({ queryKey: key, queryFn: () => api<GuestShoppingLinkDto>(base) });
  const regenerate = useMutation({
    mutationFn: (expiresInDays: GuestLinkDays) =>
      api<GuestShoppingLinkDto>(base, { method: 'POST', json: { expiresInDays } }),
    onSuccess: (data) => qc.setQueryData(key, data),
  });
  const revoke = useMutation({
    mutationFn: () => api<void>(base, { method: 'DELETE' }),
    onSuccess: () =>
      qc.setQueryData<GuestShoppingLinkDto>(key, {
        url: null,
        createdAt: null,
        createdById: null,
        expiresAt: null,
      }),
  });
  return { link, regenerate, revoke };
}

/**
 * Code-barres : photo lue sur le serveur (rien n'est enregistré), ou code tapé à la main ; le nom
 * vient de la mémoire du foyer, sinon d'Open Food Facts. `remember` retient un nom pour le foyer.
 */
export function useBarcodeActions(hid: string) {
  const base = `/v1/households/${hid}/shopping-barcodes`;
  return {
    scan: useMutation({
      mutationFn: (file: File) => {
        const body = new FormData();
        body.append('file', file);
        return api<BarcodeLookupDto>(`${base}/scan`, { method: 'POST', body });
      },
    }),
    lookup: useMutation({
      mutationFn: (code: string) => api<BarcodeLookupDto>(`${base}/${encodeURIComponent(code)}`),
    }),
    remember: useMutation({
      mutationFn: ({ code, name }: { code: string; name: string }) =>
        api<BarcodeLookupDto>(`${base}/${encodeURIComponent(code)}`, {
          method: 'PUT',
          json: { name },
        }),
    }),
  };
}

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
    // Une seule file pour la liste : un rayon changé juste après l'ajout part après la création
    // de l'article (sinon le serveur ne le connaît pas encore et le changement est perdu).
    scope: { id: `shopping-${hid}` },
    onError: (_e: unknown, _v: unknown, ctx?: Ctx) => qc.setQueryData(key, ctx?.previous),
    // Préfixe : la liste et les suggestions.
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  };
  const add = useMutation<ShoppingItemDto[], Error, ShopAddVars, Ctx>({
    mutationKey: offlineKeys.shopAdd,
    onMutate: ({ items }) => {
      const now = new Date().toISOString();
      return optimistic((list) => [
        ...list,
        // Affiché tout de suite comme le serveur le rangera (quantité, rayon deviné).
        ...items.map(({ id, text }) => {
          const { name, quantity } = parseShoppingText(text);
          return {
            id,
            text: name,
            quantity,
            aisle: guessAisle(name),
            done: false,
            createdById: memberId,
            doneById: null,
            createdAt: now,
            doneAt: null,
          };
        }),
      ]);
    },
    ...common,
  });
  const update = useMutation<ShoppingItemDto, Error, ShopUpdateVars, Ctx>({
    mutationKey: offlineKeys.shopUpdate,
    onMutate: ({ id, done, text, aisle }) =>
      optimistic((list) =>
        list.map((i) =>
          i.id !== id
            ? i
            : {
                ...i,
                ...(text !== undefined ? { text } : {}),
                ...(aisle !== undefined ? { aisle } : {}),
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
    setAisle: {
      ...update,
      mutate: ({ id, aisle }: { id: string; aisle: Aisle }) => update.mutate({ hid, id, aisle }),
    },
    remove: { ...remove, mutate: (id: string) => remove.mutate({ hid, id }) },
    clearDone: {
      ...clearDone,
      mutate: (_?: undefined, options?: { onSuccess?: () => void }) =>
        clearDone.mutate({ hid }, { onSuccess: () => options?.onSuccess?.() }),
    },
  };
}

/** « lait, pain ; œufs » ou une ligne par article → plusieurs articles d'un coup. */
export const splitItems = (text: string) =>
  text
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.slice(0, 200));
