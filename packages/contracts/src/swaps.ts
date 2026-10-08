import { z } from 'zod';
import { IsoDate } from './tasks';

/**
 * Échange de tour : « Peux-tu prendre ma vaisselle jeudi ? ». Une personne responsable d'une
 * tâche la propose à un autre membre, qui accepte (la tâche lui revient) ou refuse.
 */
export const SwapStatus = z.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED']);
export type SwapStatus = z.infer<typeof SwapStatus>;

export const SwapRequestInput = z.object({
  toMemberId: z.uuid(),
  /** Un mot facultatif (« je rentre tard jeudi »). */
  note: z.string().trim().max(200).nullable().optional(),
});
export type SwapRequestInput = z.infer<typeof SwapRequestInput>;

export const SwapDto = z.object({
  id: z.uuid(),
  occurrenceId: z.uuid(),
  /** Titre et date de la tâche, pour l'afficher sans autre requête. */
  title: z.string(),
  date: IsoDate.nullable(),
  fromMemberId: z.uuid(),
  toMemberId: z.uuid(),
  note: z.string().nullable(),
  status: SwapStatus,
  createdAt: z.string(),
});
export type SwapDto = z.infer<typeof SwapDto>;

/** Demandes en attente qui me concernent : reçues (à moi de répondre) et envoyées. */
export const SwapListDto = z.object({
  incoming: z.array(SwapDto),
  outgoing: z.array(SwapDto),
});
export type SwapListDto = z.infer<typeof SwapListDto>;
