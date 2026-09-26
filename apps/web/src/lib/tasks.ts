'use client';

import type {
  BalanceDto,
  CategoryDto,
  CategoryInput,
  CreateTaskInput,
  OccurrenceDto,
  OccurrenceQuery,
  EditScope,
  QuickAddPreview,
  RecurrencePreviewInput,
  RecurrencePreviewItem,
  SeriesDto,
  UpdateCategoryInput,
  UpdateOccurrenceInput,
} from '@agenda/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

type ListQuery = Partial<OccurrenceQuery>;

export const taskKeys = {
  all: (hid: string) => ['households', hid] as const,
  occurrences: (hid: string, q?: ListQuery) => ['households', hid, 'occurrences', q ?? {}] as const,
  balance: (hid: string) => ['households', hid, 'balance'] as const,
  categories: (hid: string) => ['households', hid, 'categories'] as const,
  series: (hid: string) => ['households', hid, 'series'] as const,
  seriesDetail: (hid: string, id: string) => ['households', hid, 'series', id] as const,
};

function qs(q: ListQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const useOccurrences = (hid: string, q: ListQuery) =>
  useQuery({
    queryKey: taskKeys.occurrences(hid, q),
    queryFn: () => api<OccurrenceDto[]>(`/v1/households/${hid}/occurrences${qs(q)}`),
    placeholderData: keepPreviousData,
    // Deux personnes, pas de temps réel en V1 : rafraîchissement léger (cf. ADR-006),
    // plus fréquent tant qu'une synchronisation Google est en cours.
    refetchInterval: (query) =>
      query.state.data?.some((o) => o.calendarSync === 'PENDING') ? 3_000 : 30_000,
  });

export const useBalance = (hid: string) =>
  useQuery({
    queryKey: taskKeys.balance(hid),
    queryFn: () => api<BalanceDto>(`/v1/households/${hid}/balance`),
  });

export const useCategories = (hid: string) =>
  useQuery({
    queryKey: taskKeys.categories(hid),
    queryFn: () => api<CategoryDto[]>(`/v1/households/${hid}/categories`),
    staleTime: 5 * 60_000,
  });

/** Toute écriture sur une tâche invalide les listes et la répartition du foyer. */
function useInvalidateTasks(hid: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['households', hid, 'occurrences'] }),
      qc.invalidateQueries({ queryKey: taskKeys.balance(hid) }),
      qc.invalidateQueries({ queryKey: taskKeys.series(hid) }),
      qc.invalidateQueries({ queryKey: ['households', hid, 'calendar'] }),
    ]);
}

export function useCreateTask(hid: string) {
  const invalidate = useInvalidateTasks(hid);
  return useMutation({
    mutationFn: (input: Partial<CreateTaskInput> & { title: string }) =>
      api<OccurrenceDto>(`/v1/households/${hid}/tasks`, { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useQuickAdd(hid: string) {
  const invalidate = useInvalidateTasks(hid);
  return useMutation({
    mutationFn: (text: string) =>
      api<OccurrenceDto>(`/v1/households/${hid}/tasks/quick`, { method: 'POST', json: { text } }),
    onSuccess: invalidate,
  });
}

export const parseQuickAdd = (hid: string, text: string, signal?: AbortSignal) =>
  api<QuickAddPreview>(`/v1/households/${hid}/quick-add/parse`, {
    method: 'POST',
    json: { text },
    signal,
  });

const scopeQs = (scope?: EditScope) => (scope ? `?scope=${scope}` : '');

export function useUpdateOccurrence(hid: string) {
  const invalidate = useInvalidateTasks(hid);
  return useMutation({
    mutationFn: ({
      id,
      scope,
      ...input
    }: UpdateOccurrenceInput & { id: string; scope?: EditScope }) =>
      api<OccurrenceDto>(`/v1/households/${hid}/occurrences/${id}${scopeQs(scope)}`, {
        method: 'PATCH',
        json: input,
      }),
    onSettled: invalidate,
  });
}

export type MoveInput = Pick<UpdateOccurrenceInput, 'date' | 'startMinute' | 'durationMinutes'>;

/**
 * Glisser-déposer du calendrier : déplacement / redimensionnement d'UNE occurrence (portée
 * « celle-ci », y compris dans une série), affiché immédiatement puis confirmé par l'API.
 */
export function useMoveOccurrence(hid: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateTasks(hid);
  return useMutation({
    mutationFn: ({ o, ...input }: MoveInput & { o: OccurrenceDto }) =>
      api<OccurrenceDto>(`/v1/households/${hid}/occurrences/${o.id}?scope=this`, {
        method: 'PATCH',
        json: { ...input, version: o.version },
      }),
    onMutate: async ({ o, ...input }) => {
      const key = ['households', hid, 'occurrences'];
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueriesData<OccurrenceDto[]>({ queryKey: key });
      qc.setQueriesData<OccurrenceDto[]>({ queryKey: key }, (list) =>
        list?.map((x) => (x.id === o.id ? { ...x, ...input } : x)),
      );
      return { snapshot };
    },
    onError: (_e, _v, context) =>
      context?.snapshot.forEach(([k, data]) => qc.setQueryData(k, data)),
    onSettled: invalidate,
  });
}

export function useDeleteOccurrence(hid: string) {
  const invalidate = useInvalidateTasks(hid);
  return useMutation({
    mutationFn: ({ id, scope }: { id: string; scope?: EditScope }) =>
      api<void>(`/v1/households/${hid}/occurrences/${id}${scopeQs(scope)}`, { method: 'DELETE' }),
    onSettled: invalidate,
  });
}

export const useSeriesList = (hid: string) =>
  useQuery({
    queryKey: taskKeys.series(hid),
    queryFn: () => api<SeriesDto[]>(`/v1/households/${hid}/series`),
  });

export const useSeriesDetail = (hid: string, id: string | null | undefined) =>
  useQuery({
    queryKey: taskKeys.seriesDetail(hid, id ?? ''),
    queryFn: () => api<SeriesDto>(`/v1/households/${hid}/series/${id}`),
    enabled: Boolean(id),
    staleTime: 0,
  });

export const previewRecurrence = (
  hid: string,
  input: RecurrencePreviewInput,
  signal?: AbortSignal,
) =>
  api<RecurrencePreviewItem[]>(`/v1/households/${hid}/recurrence/preview`, {
    method: 'POST',
    json: input,
    signal,
  });

/** Cocher / décocher : mise à jour optimiste immédiate de toutes les listes affichées. */
export function useToggleDone(hid: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateTasks(hid);
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api<OccurrenceDto>(
        `/v1/households/${hid}/occurrences/${id}/${done ? 'complete' : 'reopen'}`,
        { method: 'POST' },
      ),
    onMutate: async ({ id, done }) => {
      const key = ['households', hid, 'occurrences'];
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueriesData<OccurrenceDto[]>({ queryKey: key });
      qc.setQueriesData<OccurrenceDto[]>({ queryKey: key }, (list) =>
        list?.map((o) => (o.id === id ? { ...o, status: done ? 'DONE' : 'TODO' } : o)),
      );
      return { snapshot };
    },
    onError: (_e, _v, context) =>
      context?.snapshot.forEach(([k, data]) => qc.setQueryData(k, data)),
    onSettled: invalidate,
  });
}

export function useCategoryMutations(hid: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: taskKeys.categories(hid) }),
      qc.invalidateQueries({ queryKey: ['households', hid, 'occurrences'] }),
    ]);
  const base = `/v1/households/${hid}/categories`;
  return {
    create: useMutation({
      mutationFn: (input: CategoryInput) => api<CategoryDto>(base, { method: 'POST', json: input }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateCategoryInput & { id: string }) =>
        api<CategoryDto>(`${base}/${id}`, { method: 'PATCH', json: input }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
  };
}
