'use client';

import type { ActivityDto, ActivityPageDto, TrashItemDto } from '@agenda/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const activityKey = (hid: string) => ['households', hid, 'activity'] as const;
export const trashKey = (hid: string) => ['households', hid, 'trash'] as const;

export const useActivity = (hid: string) =>
  useInfiniteQuery({
    queryKey: activityKey(hid),
    queryFn: ({ pageParam }) =>
      api<ActivityPageDto>(
        `/v1/households/${hid}/activity?limit=50${pageParam ? `&before=${pageParam}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
  });

export const useTrash = (hid: string) =>
  useQuery({
    queryKey: trashKey(hid),
    queryFn: () => api<TrashItemDto[]>(`/v1/households/${hid}/trash`),
  });

type Restored = { occurrenceId: string | null };

/** Restaurer depuis la corbeille (`trashId`) ou annuler la suppression d'une tâche (`occurrenceId`). */
export function useRestore(hid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: { trashId: string } | { occurrenceId: string }) =>
      api<Restored>(
        'trashId' in target
          ? `/v1/households/${hid}/trash/${target.trashId}/restore`
          : `/v1/households/${hid}/occurrences/${target.occurrenceId}/restore`,
        { method: 'POST' },
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['households', hid] }),
  });
}

/** Tout le journal (pages de 500), pour l'export. */
export async function fetchAllActivity(hid: string): Promise<ActivityDto[]> {
  const all: ActivityDto[] = [];
  let before: string | null = null;
  do {
    const page: ActivityPageDto = await api<ActivityPageDto>(
      `/v1/households/${hid}/activity?limit=500${before ? `&before=${before}` : ''}`,
    );
    all.push(...page.items);
    before = page.next;
  } while (before);
  return all;
}

/** CSV (RFC 4180, séparateur « ; » pour Excel en français, BOM UTF-8). */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
