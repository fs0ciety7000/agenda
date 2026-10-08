import type { NoteDto, NoteInput, UpdateNoteInput } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const notesKey = (hid: string) => ['households', hid, 'notes'] as const;

export const useNotes = (hid: string) =>
  useQuery({
    queryKey: notesKey(hid),
    queryFn: () => api<NoteDto[]>(`/v1/households/${hid}/notes`),
  });

/** Notes : confirmées par le serveur (pas de file hors ligne), liste rechargée ensuite. */
export function useNoteActions(hid: string) {
  const qc = useQueryClient();
  const base = `/v1/households/${hid}/notes`;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: notesKey(hid) });
  };
  return {
    create: useMutation({
      mutationFn: (input: Partial<NoteInput> & { title: string }) =>
        api<NoteDto>(base, { method: 'POST', json: input }),
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateNoteInput & { id: string }) =>
        api<NoteDto>(`${base}/${id}`, { method: 'PATCH', json: input }),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
      onSettled: refresh,
    }),
  };
}
