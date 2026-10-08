import type { ImportantDateDto, ImportantDateInput } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const datesKey = (hid: string) => ['households', hid, 'dates'] as const;

export const useImportantDates = (hid: string) =>
  useQuery({
    queryKey: datesKey(hid),
    queryFn: () => api<ImportantDateDto[]>(`/v1/households/${hid}/important-dates`),
  });

/** Dates importantes : confirmées par le serveur (calcul de la prochaine occurrence côté API). */
export function useImportantDateActions(hid: string) {
  const qc = useQueryClient();
  const base = `/v1/households/${hid}/important-dates`;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: datesKey(hid) });
  };
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: string; input: ImportantDateInput }) =>
        api<ImportantDateDto>(id ? `${base}/${id}` : base, {
          method: id ? 'PUT' : 'POST',
          json: input,
        }),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
      onSettled: refresh,
    }),
  };
}
