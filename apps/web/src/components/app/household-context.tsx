'use client';

import type { HouseholdDto, MeResponse } from '@agenda/contracts';
import { createContext, useContext } from 'react';

export interface Session {
  me: MeResponse;
  household: HouseholdDto;
}

export const SessionContext = createContext<Session | null>(null);

/** Utilisateur + foyer courant (V1 : le premier foyer ; sélecteur multi-foyers plus tard). */
export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <AppShell>');
  return ctx;
}
