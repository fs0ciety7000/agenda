'use client';

import type { AvailableCalendarDto, CalendarStatusDto } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

const statusKey = (hid: string) => ['households', hid, 'calendar'] as const;

export const useCalendarStatus = (hid: string) =>
  useQuery({
    queryKey: statusKey(hid),
    queryFn: () => api<CalendarStatusDto>(`/v1/households/${hid}/calendar`),
    // La synchro tourne en arrière-plan : état toujours rechargé à l'affichage, puis régulièrement.
    staleTime: 0,
    refetchInterval: 20_000,
  });

export const useAvailableCalendars = (hid: string, enabled: boolean) =>
  useQuery({
    queryKey: [...statusKey(hid), 'available'],
    queryFn: () => api<AvailableCalendarDto[]>(`/v1/households/${hid}/calendar/available`),
    enabled,
  });

/** URL de démarrage de l'autorisation Google Calendar (navigation pleine page). */
export const connectUrl = (next = '/settings') =>
  `/v1/calendar/google/connect?next=${encodeURIComponent(next)}`;

export function useCalendarMutations(hid: string) {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: statusKey(hid) }),
      qc.invalidateQueries({ queryKey: ['households', hid, 'occurrences'] }),
    ]);
  const base = `/v1/households/${hid}/calendar`;
  return {
    link: useMutation({
      mutationFn: (calendarId: string) =>
        api<CalendarStatusDto>(`${base}/link`, { method: 'PUT', json: { calendarId } }),
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: (removeEvents: boolean) =>
        api<void>(`${base}/link?removeEvents=${removeEvents}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
    syncNow: useMutation({
      mutationFn: () => api<void>(`${base}/sync`, { method: 'POST' }),
      onSuccess: () => setTimeout(() => void refresh(), 3000),
    }),
    disconnect: useMutation({
      mutationFn: () => api<void>('/v1/me/google-calendar', { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}
