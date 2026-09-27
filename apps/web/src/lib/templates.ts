'use client';

import type {
  ApplyTemplateInput,
  OccurrenceDto,
  SeriesHistoryDto,
  TaskTemplateDto,
  TemplateInput,
} from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const templatesKey = (hid: string) => ['households', hid, 'templates'] as const;

export const useTemplates = (hid: string) =>
  useQuery({
    queryKey: templatesKey(hid),
    queryFn: () => api<TaskTemplateDto[]>(`/v1/households/${hid}/templates`),
  });

export function useTemplateMutations(hid: string) {
  const qc = useQueryClient();
  const base = `/v1/households/${hid}/templates`;
  const invalidate = () => qc.invalidateQueries({ queryKey: templatesKey(hid) });
  return {
    save: useMutation({
      mutationFn: ({ id, ...input }: TemplateInput & { id?: string }) =>
        api<TaskTemplateDto>(id ? `${base}/${id}` : base, {
          method: id ? 'PUT' : 'POST',
          json: input,
        }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
    apply: useMutation({
      mutationFn: ({ id, ...input }: ApplyTemplateInput & { id: string }) =>
        api<OccurrenceDto[]>(`${base}/${id}/apply`, { method: 'POST', json: input }),
      onSuccess: () =>
        Promise.all([
          qc.invalidateQueries({ queryKey: ['households', hid, 'occurrences'] }),
          qc.invalidateQueries({ queryKey: ['households', hid, 'balance'] }),
        ]),
    }),
  };
}

/** Historique d'une tâche récurrente : qui l'a faite, et quand. */
export const useSeriesHistory = (hid: string, seriesId: string | null | undefined) =>
  useQuery({
    queryKey: ['households', hid, 'series', seriesId ?? '', 'history'],
    queryFn: () => api<SeriesHistoryDto>(`/v1/households/${hid}/series/${seriesId}/history`),
    enabled: Boolean(seriesId),
  });
