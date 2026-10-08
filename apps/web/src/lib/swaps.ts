import type { SwapDto, SwapListDto, SwapRequestInput } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

// Hors de la clé des occurrences (dont le cache est mis à jour comme une liste de tâches) ; le
// temps réel « tasks » recharge aussi les échanges.
export const swapsKey = (hid: string) => ['households', hid, 'swaps'] as const;

export const useSwaps = (hid: string) =>
  useQuery({
    queryKey: swapsKey(hid),
    queryFn: () => api<SwapListDto>(`/v1/households/${hid}/swaps`),
  });

export function useSwapActions(hid: string) {
  const qc = useQueryClient();
  const base = `/v1/households/${hid}`;
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: swapsKey(hid) }),
      qc.invalidateQueries({ queryKey: ['households', hid, 'occurrences'] }),
    ]);
  return {
    request: useMutation({
      mutationFn: ({ occurrenceId, input }: { occurrenceId: string; input: SwapRequestInput }) =>
        api<SwapDto>(`${base}/occurrences/${occurrenceId}/swap`, { method: 'POST', json: input }),
      onSettled: invalidate,
    }),
    accept: useMutation({
      mutationFn: (id: string) => api<SwapDto>(`${base}/swaps/${id}/accept`, { method: 'POST' }),
      onSettled: invalidate,
    }),
    decline: useMutation({
      mutationFn: (id: string) => api<SwapDto>(`${base}/swaps/${id}/decline`, { method: 'POST' }),
      onSettled: invalidate,
    }),
    cancel: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/swaps/${id}`, { method: 'DELETE' }),
      onSettled: invalidate,
    }),
  };
}
