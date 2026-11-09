'use client';

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { LEGACY_PERSIST_KEY, PERSIST_KEY, PERSIST_MAX_AGE } from '@/lib/offline';
import { makeClient } from '@/lib/query-client';

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
