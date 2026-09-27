import { z } from 'zod';

/** Liste de courses permanente du foyer (distincte des listes attachées à une tâche). */
export const MAX_SHOPPING_ITEMS = 300;
const ShoppingText = z.string().trim().min(1).max(200);

export const ShoppingItemDto = z.object({
  id: z.uuid(),
  text: z.string(),
  done: z.boolean(),
  /** Qui l'a ajouté / coché (id de membre), si connu. */
  createdById: z.uuid().nullable(),
  doneById: z.uuid().nullable(),
  createdAt: z.string(),
  doneAt: z.string().nullable(),
});
export type ShoppingItemDto = z.infer<typeof ShoppingItemDto>;

/**
 * `id` facultatif choisi par le client (UUID) : un ajout rejoué (hors ligne, réseau coupé)
 * ne crée jamais de doublon.
 */
export const ShoppingItemInput = z.object({ id: z.uuid().optional(), text: ShoppingText });
export type ShoppingItemInput = z.infer<typeof ShoppingItemInput>;

export const UpdateShoppingItemInput = z
  .object({ text: ShoppingText.optional(), done: z.boolean().optional() })
  .refine((v) => v.text !== undefined || v.done !== undefined, { message: 'nothing to update' });
export type UpdateShoppingItemInput = z.infer<typeof UpdateShoppingItemInput>;

/** Ce qui a changé dans le foyer (événements temps réel, `GET …/events`). */
export const RealtimeTopic = z.enum(['tasks', 'shopping', 'notifications', 'comments']);
export type RealtimeTopic = z.infer<typeof RealtimeTopic>;
