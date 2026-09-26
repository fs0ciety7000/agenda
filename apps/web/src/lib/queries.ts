'use client';

import type { AuthProvidersDto, HouseholdDto, MeResponse } from '@agenda/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const queryKeys = {
  me: ['me'] as const,
  households: ['households'] as const,
};

export const useMe = () =>
  useQuery({ queryKey: queryKeys.me, queryFn: () => api<MeResponse>('/v1/me') });

export const useHouseholds = () =>
  useQuery({
    queryKey: queryKeys.households,
    queryFn: () => api<HouseholdDto[]>('/v1/households'),
  });

/** Méthodes de connexion disponibles (Google configuré ? inscriptions ouvertes ?). */
export const useProviders = () =>
  useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => api<AuthProvidersDto>('/v1/auth/providers'),
    staleTime: 10 * 60_000,
  });
