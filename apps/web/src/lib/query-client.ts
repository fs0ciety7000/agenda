import { QueryClient, onlineManager } from '@tanstack/react-query';
import { ApiError } from './api';
import { PERSIST_MAX_AGE, registerOfflineMutations } from './offline';

/** Client TanStack Query de l'app : un par onglet, et un par requête pendant le rendu serveur. */
export function makeClient() {
  // TanStack Query suppose le réseau disponible au démarrage : on part de l'état réel.
  if (typeof navigator !== 'undefined') onlineManager.setOnline(navigator.onLine);
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Navigateur : gardées assez longtemps pour être relues hors ligne (cache persistant).
        // Serveur : jamais de minuteur (Infinity), sinon chaque rendu armerait un minuteur de
        // 7 jours qui garde tout son cache en mémoire (fuite de ~0,2 Mo par page).
        gcTime: typeof window === 'undefined' ? Infinity : PERSIST_MAX_AGE,
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
