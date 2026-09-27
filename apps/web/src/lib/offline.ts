'use client';

import { unsubscribeWebPush } from './web-push';
import type { OccurrenceDto, ShoppingItemDto } from '@agenda/contracts';
import { type QueryClient, onlineManager, useMutationState } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ApiError, api } from './api';

/**
 * Modifications possibles hors ligne : mises en file (TanStack Query, mutations « en pause »),
 * conservées même si l'onglet est fermé (cache persistant), envoyées au retour du réseau.
 * Leurs fonctions sont déclarées ici (et non dans les composants) pour pouvoir être rejouées
 * après un rechargement : les variables contiennent donc tout ce qu'il faut (foyer, identifiants).
 */
export const offlineKeys = {
  toggle: ['offline', 'toggle'],
  quickAdd: ['offline', 'quick-add'],
  shopAdd: ['offline', 'shopping-add'],
  shopUpdate: ['offline', 'shopping-update'],
  shopRemove: ['offline', 'shopping-remove'],
  shopClear: ['offline', 'shopping-clear'],
} as const;

export type ToggleVars = { hid: string; id: string; done: boolean };
/** `key` : Idempotency-Key, pour qu'un renvoi ne crée jamais la tâche deux fois. */
export type QuickAddVars = { hid: string; text: string; key: string };
export type ShopAddVars = { hid: string; items: { id: string; text: string }[] };
export type ShopUpdateVars = { hid: string; id: string; done?: boolean; text?: string };
export type ShopRemoveVars = { hid: string; id: string };
export type ShopClearVars = { hid: string };

/** Réseau coupé ou serveur indisponible : on réessaie ; erreur métier (4xx) : on abandonne. */
const retryTransient = (count: number, e: unknown) =>
  count < 5 && e instanceof ApiError && (e.status === 0 || e.status >= 500);

export function registerOfflineMutations(qc: QueryClient) {
  const common = {
    networkMode: 'online' as const,
    retry: retryTransient,
    // Rejouées après un rechargement (sans les callbacks des écrans) : on recharge le foyer.
    onSettled: (_data: unknown, _error: unknown, vars: { hid: string }) =>
      qc.invalidateQueries({ queryKey: ['households', vars.hid] }),
  };
  const shop = (hid: string) => `/v1/households/${hid}/shopping`;
  qc.setMutationDefaults(offlineKeys.toggle, {
    ...common,
    mutationFn: ({ hid, id, done }: ToggleVars) =>
      api<OccurrenceDto>(
        `/v1/households/${hid}/occurrences/${id}/${done ? 'complete' : 'reopen'}`,
        { method: 'POST' },
      ),
  });
  qc.setMutationDefaults(offlineKeys.quickAdd, {
    ...common,
    mutationFn: ({ hid, text, key }: QuickAddVars) =>
      api<OccurrenceDto>(`/v1/households/${hid}/tasks/quick`, {
        method: 'POST',
        json: { text },
        headers: { 'idempotency-key': key },
      }),
  });
  qc.setMutationDefaults(offlineKeys.shopAdd, {
    ...common,
    // Identifiants choisis par le navigateur : renvoyer un article ne le duplique pas.
    mutationFn: ({ hid, items }: ShopAddVars) =>
      Promise.all(
        items.map((item) => api<ShoppingItemDto>(shop(hid), { method: 'POST', json: item })),
      ),
  });
  qc.setMutationDefaults(offlineKeys.shopUpdate, {
    ...common,
    mutationFn: ({ hid, id, ...patch }: ShopUpdateVars) =>
      api<ShoppingItemDto>(`${shop(hid)}/${id}`, { method: 'PATCH', json: patch }),
  });
  qc.setMutationDefaults(offlineKeys.shopRemove, {
    ...common,
    mutationFn: ({ hid, id }: ShopRemoveVars) =>
      api<void>(`${shop(hid)}/${id}`, { method: 'DELETE' }).catch((e: unknown) => {
        // Déjà retiré par l'autre : rien à faire.
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }),
  });
  qc.setMutationDefaults(offlineKeys.shopClear, {
    ...common,
    mutationFn: ({ hid }: ShopClearVars) =>
      api<void>(`${shop(hid)}/clear-done`, { method: 'POST' }),
  });
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/** Nombre de modifications en attente d'envoi. */
export const usePendingChanges = () =>
  useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;

/** Déconnexion : plus rien du compte ne reste dans le navigateur. */
export async function clearOfflineData() {
  await unsubscribeWebPush();
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* stockage indisponible */
  }
  if ('caches' in window) {
    for (const key of await caches.keys()) if (key.startsWith('gn-pages')) await caches.delete(key);
  }
}

export const PERSIST_KEY = 'agenda-gn-cache';
export const PERSIST_MAX_AGE = 7 * 24 * 3600_000;
