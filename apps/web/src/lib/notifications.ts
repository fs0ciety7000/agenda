'use client';

import type { NotificationListDto, NotificationPreferenceDto, StatsDto } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const notificationKeys = {
  list: (hid: string) => ['households', hid, 'notifications'] as const,
  prefs: (hid: string) => ['households', hid, 'notification-preferences'] as const,
  stats: (hid: string, days: number) => ['households', hid, 'stats', days] as const,
};

export const useNotifications = (hid: string) =>
  useQuery({
    queryKey: notificationKeys.list(hid),
    queryFn: () => api<NotificationListDto>(`/v1/households/${hid}/notifications?limit=30`),
    refetchInterval: 60_000,
  });

export function useMarkNotificationsRead(hid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      api<void>(`/v1/households/${hid}/notifications/read`, { method: 'POST', json: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.list(hid) }),
  });
}

export const useNotificationPreferences = (hid: string) =>
  useQuery({
    queryKey: notificationKeys.prefs(hid),
    queryFn: () =>
      api<NotificationPreferenceDto[]>(`/v1/households/${hid}/notification-preferences`),
  });

export function useUpdateNotificationPreferences(hid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (preferences: NotificationPreferenceDto[]) =>
      api<NotificationPreferenceDto[]>(`/v1/households/${hid}/notification-preferences`, {
        method: 'PUT',
        json: { preferences },
      }),
    onSuccess: (data) => {
      qc.setQueryData(notificationKeys.prefs(hid), data);
      void qc.invalidateQueries({ queryKey: notificationKeys.list(hid) });
    },
  });
}

export const useStats = (hid: string, days: 7 | 30) =>
  useQuery({
    queryKey: notificationKeys.stats(hid, days),
    queryFn: () => api<StatsDto>(`/v1/households/${hid}/stats?days=${days}`),
  });
