'use client';

import type { AbsenceDto, CreateAbsenceInput } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const absencesKey = (hid: string) => ['households', hid, 'absences'] as const;

export const useAbsences = (hid: string) =>
  useQuery({
    queryKey: absencesKey(hid),
    queryFn: () => api<AbsenceDto[]>(`/v1/households/${hid}/absences`),
  });

/** Déclarer / annuler une absence : les responsables des tâches changent, tout est rechargé. */
export function useAbsenceMutations(hid: string) {
  const qc = useQueryClient();
  const base = `/v1/households/${hid}/absences`;
  // Le préfixe ['households'] couvre le foyer (absentUntil), les tâches et la répartition.
  const invalidate = () => qc.invalidateQueries({ queryKey: ['households'] });
  return {
    create: useMutation({
      mutationFn: (input: CreateAbsenceInput) =>
        api<AbsenceDto>(base, { method: 'POST', json: input }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
  };
}
