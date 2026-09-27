'use client';

import type {
  AdminCreateUserInput,
  AdminHouseholdDto,
  AdminOverviewDto,
  AdminTestResultDto,
  AdminUserDto,
  BackupRunDto,
} from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

const key = ['admin'] as const;

export const useAdminOverview = () =>
  useQuery({
    queryKey: [...key, 'overview'],
    queryFn: () => api<AdminOverviewDto>('/v1/admin/overview'),
    // Une sauvegarde en cours : suivie toutes les 5 s.
    refetchInterval: (q) =>
      q.state.data?.backups.some((b) => b.status === 'PENDING' || b.status === 'RUNNING')
        ? 5_000
        : false,
  });

export const useAdminUsers = () =>
  useQuery({ queryKey: [...key, 'users'], queryFn: () => api<AdminUserDto[]>('/v1/admin/users') });

export const useAdminHouseholds = () =>
  useQuery({
    queryKey: [...key, 'households'],
    queryFn: () => api<AdminHouseholdDto[]>('/v1/admin/households'),
  });

export function useAdminActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const post = (path: string) => api<void>(`/v1/admin/${path}`, { method: 'POST' });
  return {
    createUser: useMutation({
      mutationFn: (input: AdminCreateUserInput) =>
        api<AdminUserDto>('/v1/admin/users', { method: 'POST', json: input }),
      onSuccess: refresh,
    }),
    userAction: useMutation({
      mutationFn: ({
        id,
        action,
      }: {
        id: string;
        action: 'disable' | 'enable' | 'logout-all' | 'password-link' | 'delete';
      }) =>
        action === 'delete'
          ? api<void>(`/v1/admin/users/${id}`, { method: 'DELETE' })
          : post(`users/${id}/${action}`),
      onSuccess: refresh,
    }),
    backup: useMutation({
      mutationFn: () => api<BackupRunDto>('/v1/admin/backups', { method: 'POST' }),
      onSuccess: refresh,
    }),
    testEmail: useMutation({
      mutationFn: () => api<AdminTestResultDto>('/v1/admin/test-email', { method: 'POST' }),
    }),
    testPush: useMutation({
      mutationFn: () => api<AdminTestResultDto>('/v1/admin/test-push', { method: 'POST' }),
    }),
  };
}
