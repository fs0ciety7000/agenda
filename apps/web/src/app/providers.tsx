'use client';

import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import {
  LEGACY_PERSIST_KEY,
  PERSIST_KEY,
  PERSIST_MAX_AGE,
  registerOfflineMutations,
} from '@/lib/offline';

function makeClient() {
  // TanStack Query suppose le réseau disponible au démarrage : on part de l'état réel.
  if (typeof navigator !== 'undefined') onlineManager.setOnline(navigator.onLine);
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Gardées assez longtemps pour être relues hors ligne (cache persistant).
        gcTime: PERSIST_MAX_AGE,
        refetchOnWindowFocus: true,
        // Pas de retry sur les erreurs client (401, 404…) : seulement réseau / 5xx.
        retry: (count, e) =>
          count < 2 && (!(e instanceof ApiError) || e.status === 0 || e.status >= 500),
      },
      // Par défaut, une action échoue tout de suite hors ligne (message d'erreur) ; seules celles
      // de lib/offline.ts sont mises en file.
      mutations: { networkMode: 'always' },
    },
  });
  registerOfflineMutations(client);
  return client;
}

/** Stockage local (tâches, courses…) : relu au démarrage, même sans réseau. */
const persister =
  typeof window === 'undefined'
    ? undefined
    : createAsyncStoragePersister({
        storage: {
          getItem: (k) => {
            try {
              const value = window.localStorage.getItem(k);
              if (value !== null || k !== PERSIST_KEY) return value;
              const legacy = window.localStorage.getItem(LEGACY_PERSIST_KEY);
              window.localStorage.removeItem(LEGACY_PERSIST_KEY);
              return legacy;
            } catch {
              return null;
            }
          },
          setItem: (k, v) => {
            try {
              window.localStorage.setItem(k, v);
            } catch {
              /* quota dépassé ou stockage désactivé : pas de cache hors ligne */
            }
          },
          removeItem: (k) => {
            try {
              window.localStorage.removeItem(k);
            } catch {
              /* idem */
            }
          },
        },
        key: PERSIST_KEY,
        throttleTime: 1000,
      });

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister: persister!,
        maxAge: PERSIST_MAX_AGE,
        buster: process.env.NEXT_PUBLIC_BUILD_ID,
        dehydrateOptions: {
          // Données réussies seulement ; modifications en attente (par défaut : en pause).
          shouldDehydrateQuery: (q) => q.state.status === 'success',
        },
      }}
      // Modifications faites hors ligne avant une fermeture de l'onglet : envoyées maintenant.
      onSuccess={() => void client.resumePausedMutations().then(() => client.invalidateQueries())}
    >
      <ToastProvider>{children}</ToastProvider>
    </PersistQueryClientProvider>
  );
}
