'use client';

import type { RealtimeTopic } from '@agenda/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

/**
 * Temps réel : un flux SSE par foyer (`GET /v1/households/:id/events`). L'événement ne contient que
 * le sujet modifié ; on recharge ce sujet par l'API habituelle. Tant que le flux est ouvert, les
 * rafraîchissements périodiques ralentissent (cf. `pollInterval`).
 */
let connected = false;
const listeners = new Set<() => void>();
const setConnected = (value: boolean) => {
  if (connected === value) return;
  connected = value;
  listeners.forEach((l) => l());
};

export const isRealtimeConnected = () => connected;

/** Intervalle de rafraîchissement : lent si le temps réel fonctionne, sinon celui demandé. */
export const pollInterval = (fallbackMs: number) => (connected ? 5 * 60_000 : fallbackMs);

export const useRealtimeStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => connected,
    () => false,
  );

const keysFor = (hid: string, topic: RealtimeTopic): (readonly unknown[])[] => {
  switch (topic) {
    case 'shopping':
      return [['households', hid, 'shopping']];
    case 'notifications':
      return [['households', hid, 'notifications']];
    case 'tasks':
      return [
        ['households', hid, 'occurrences'],
        ['households', hid, 'balance'],
        ['households', hid, 'series'],
        ['households', hid, 'calendar'],
        ['households', hid, 'stats'],
        ['households', hid, 'activity'],
        ['households', hid, 'trash'],
      ];
  }
};

export function useRealtime(hid: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!hid || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let stopped = false;
    /** Coupure depuis la dernière connexion (reconnexion automatique du navigateur comprise). */
    let lost = false;

    const open = () => {
      source = new EventSource(`/v1/households/${hid}/events`);
      source.onopen = () => {
        // Reconnexion : ce qui a changé pendant la coupure n'a pas été signalé.
        if (lost) void qc.invalidateQueries({ queryKey: ['households', hid] });
        lost = false;
        attempts = 0;
        setConnected(true);
      };
      source.addEventListener('change', (e) => {
        const { topic } = JSON.parse((e as MessageEvent<string>).data) as { topic: RealtimeTopic };
        for (const queryKey of keysFor(hid, topic)) void qc.invalidateQueries({ queryKey });
      });
      source.onerror = () => {
        lost = true;
        setConnected(false);
        // Coupure réseau : le navigateur se reconnecte seul. Refus (session expirée, 5xx) : le
        // flux est fermé ; on renouvelle la session puis on réessaie, de plus en plus lentement.
        if (source?.readyState !== EventSource.CLOSED || stopped) return;
        attempts++;
        retry = setTimeout(
          () => {
            void api('/v1/me')
              .catch(() => undefined)
              .finally(() => !stopped && open());
          },
          Math.min(60_000, 1000 * 2 ** attempts),
        );
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      source?.close();
      setConnected(false);
    };
  }, [hid, qc]);
}
