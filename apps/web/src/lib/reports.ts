'use client';

import type {
  AdminReportDto,
  AdminUpdateReportInput,
  CreateReportInput,
  ReportDiagnostics,
  ReportDto,
} from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

const mineKey = ['reports', 'mine'] as const;
const adminKey = ['admin', 'reports'] as const;

export const useMyReports = () =>
  useQuery({ queryKey: mineKey, queryFn: () => api<ReportDto[]>('/v1/reports') });

/** Envoi du signalement, puis de la capture éventuelle. */
export function useReportMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: mineKey });
  return {
    send: useMutation({
      mutationFn: async ({ input, file }: { input: CreateReportInput; file: File | null }) => {
        const report = await api<ReportDto>('/v1/reports', { method: 'POST', json: input });
        if (!file) return report;
        const body = new FormData();
        body.append('file', file);
        return api<ReportDto>(`/v1/reports/${report.id}/screenshot`, { method: 'POST', body });
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`/v1/reports/${id}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

export const useAdminReports = (status: string) =>
  useQuery({
    queryKey: [...adminKey, status],
    queryFn: () => api<AdminReportDto[]>(`/v1/admin/reports?status=${status}`),
  });

export function useAdminReportMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  return {
    update: useMutation({
      mutationFn: ({ id, ...input }: AdminUpdateReportInput & { id: string }) =>
        api<AdminReportDto>(`/v1/admin/reports/${id}`, { method: 'PATCH', json: input }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`/v1/admin/reports/${id}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

/**
 * Informations techniques proposées à l'utilisateur (affichées avant l'envoi, jointes seulement
 * s'il coche la case). Jamais de contenu de tâche ni d'identifiant.
 */
export function collectDiagnostics(from: string | null, pendingChanges: number): ReportDiagnostics {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  // Chemin seulement, identifiants remplacés : « /tasks/:id » plutôt que l'UUID d'une tâche.
  const page = from
    ? from
        .split('?')[0]!
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id')
        .slice(0, 200)
    : null;
  return {
    platform: 'web',
    appVersion: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
    os: nav.userAgentData?.platform || null,
    browser: navigator.userAgent.slice(0, 300),
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${window.innerWidth}×${window.innerHeight}`,
    page,
    online: navigator.onLine,
    pendingChanges,
  };
}
