import type {
  NoteDto,
  NoteInput,
  NoteRevisionDto,
  RevealedNoteDto,
  RevealNoteInput,
  UpdateNoteInput,
} from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const notesKey = (hid: string) => ['households', hid, 'notes'] as const;

export const useNotes = (hid: string) =>
  useQuery({
    queryKey: notesKey(hid),
    queryFn: () => api<NoteDto[]>(`/v1/households/${hid}/notes`),
  });

/** Versions précédentes d'une note, chargées quand on les ouvre. */
export const useNoteRevisions = (hid: string, noteId: string, enabled: boolean) =>
  useQuery({
    queryKey: [...notesKey(hid), noteId, 'revisions'],
    queryFn: () => api<NoteRevisionDto[]>(`/v1/households/${hid}/notes/${noteId}/revisions`),
    enabled,
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
    restore: useMutation({
      mutationFn: ({
        id,
        revisionId,
        version,
      }: {
        id: string;
        revisionId: string;
        version: number;
      }) =>
        api<NoteDto>(`${base}/${id}/revisions/${revisionId}/restore`, {
          method: 'POST',
          json: { version },
        }),
      onSettled: refresh,
    }),
    // Contenu d'une note sensible (403 VAULT_LOCKED : demander le mot de passe, puis réessayer).
    reveal: useMutation({
      mutationFn: ({ id, ...input }: RevealNoteInput & { id: string }) =>
        api<RevealedNoteDto>(`${base}/${id}/reveal`, { method: 'POST', json: input }),
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
      onSettled: refresh,
    }),
  };
}
