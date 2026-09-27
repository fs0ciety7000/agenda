'use client';

import type { CommentDto } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const commentsKey = (hid: string, occurrenceId: string) =>
  ['households', hid, 'comments', occurrenceId] as const;

/** Commentaires d'une tâche ; rafraîchis en temps réel (sujet « comments »). */
export const useComments = (hid: string, occurrenceId: string) =>
  useQuery({
    queryKey: commentsKey(hid, occurrenceId),
    queryFn: () => api<CommentDto[]>(`/v1/households/${hid}/occurrences/${occurrenceId}/comments`),
  });

export function useCommentMutations(hid: string, occurrenceId: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: commentsKey(hid, occurrenceId) }),
      qc.invalidateQueries({ queryKey: ['households', hid, 'occurrences'] }),
    ]);
  return {
    add: useMutation({
      mutationFn: (body: string) =>
        api<CommentDto>(`/v1/households/${hid}/occurrences/${occurrenceId}/comments`, {
          method: 'POST',
          json: { body },
        }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        api<void>(`/v1/households/${hid}/comments/${id}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
  };
}
