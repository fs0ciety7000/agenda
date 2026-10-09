import { z } from 'zod';

/** Liste de courses permanente du foyer (distincte des listes attachées à une tâche). */
export const MAX_SHOPPING_ITEMS = 300;
const ShoppingText = z.string().trim().min(1).max(200);
const Quantity = z.string().trim().max(40);

/** Rayons du magasin, dans l'ordre d'un parcours habituel (cf. @agenda/domain AISLES). */
export const Aisle = z.enum([
  'PRODUCE',
  'BAKERY',
  'DAIRY',
  'MEAT_FISH',
  'FROZEN',
  'PANTRY',
  'DRINKS',
  'HOUSEHOLD',
  'HYGIENE',
  'OTHER',
]);
export type Aisle = z.infer<typeof Aisle>;

export const ShoppingItemDto = z.object({
  id: z.uuid(),
  text: z.string(),
  /** « 2 kg », « x6 » ; null = pas de quantité. */
  quantity: z.string().nullable().optional(),
  aisle: Aisle.optional(),
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
export const ShoppingItemInput = z.object({
  id: z.uuid().optional(),
  /** Sans `quantity` : « 2 kg de pommes » est découpé par le serveur. */
  text: ShoppingText,
  quantity: Quantity.nullish(),
  /** Sans rayon : celui déjà choisi pour ce produit, sinon deviné. */
  aisle: Aisle.optional(),
});
export type ShoppingItemInput = z.infer<typeof ShoppingItemInput>;

export const UpdateShoppingItemInput = z
  .object({
    text: ShoppingText.optional(),
    done: z.boolean().optional(),
    quantity: Quantity.nullish(),
    aisle: Aisle.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'nothing to update' });
export type UpdateShoppingItemInput = z.infer<typeof UpdateShoppingItemInput>;

/** Produit souvent acheté, absent de la liste : proposé en un geste. */
export const ShoppingSuggestionDto = z.object({
  text: z.string(),
  aisle: Aisle,
  timesBought: z.number().int(),
});
export type ShoppingSuggestionDto = z.infer<typeof ShoppingSuggestionDto>;

/** Ce qui a changé dans le foyer (événements temps réel, `GET …/events`). */
export const RealtimeTopic = z.enum([
  'tasks',
  'shopping',
  'notifications',
  'comments',
  'meals',
  'expenses',
  'notes',
  'dates',
]);
export type RealtimeTopic = z.infer<typeof RealtimeTopic>;

/**
 * Lien invité vers la liste de courses (baby-sitter, quelqu'un qui garde la maison) : lecture
 * seule, sans compte, un seul par foyer, révocable. `url` null = aucun lien actif.
 */
export const GuestShoppingLinkDto = z.object({
  url: z.string().nullable(),
  createdAt: z.string().nullable(),
  /** Membre qui a créé le lien (id), si connu. */
  createdById: z.uuid().nullable(),
});
export type GuestShoppingLinkDto = z.infer<typeof GuestShoppingLinkDto>;

/** Article vu par l'invité : ni auteur ni dates (rien de plus que la liste elle-même). */
export const GuestShoppingItemDto = z.object({
  id: z.uuid(),
  text: z.string(),
  quantity: z.string().nullable(),
  aisle: Aisle,
  done: z.boolean(),
});
export type GuestShoppingItemDto = z.infer<typeof GuestShoppingItemDto>;

/** Liste vue par l'invité (`GET /v1/guest/shopping/:token`). */
export const GuestShoppingDto = z.object({
  householdName: z.string(),
  items: z.array(GuestShoppingItemDto),
});
export type GuestShoppingDto = z.infer<typeof GuestShoppingDto>;

/** Photos de code-barres acceptées (lues sur le serveur, jamais conservées). */
export const BARCODE_SCAN_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Code-barres d'un produit : EAN-8, UPC-A (12), EAN-13 ou GTIN-14, chiffres seulement. */
export const Barcode = z.string().regex(/^(\d{8}|\d{12,14})$/);

/**
 * Produit d'un code-barres. `barcode` null : rien lu sur la photo ; `name` null : produit
 * inconnu (à nommer, le foyer s'en souviendra). `source` : nom retenu par le foyer ou trouvé
 * dans Open Food Facts.
 */
export const BarcodeLookupDto = z.object({
  barcode: z.string().nullable(),
  name: z.string().nullable(),
  source: z.enum(['HOUSEHOLD', 'OPEN_FOOD_FACTS']).nullable(),
});
export type BarcodeLookupDto = z.infer<typeof BarcodeLookupDto>;

/** Nom à retenir pour un code-barres (corrigé ou donné par un membre). */
export const RememberBarcodeInput = z.object({ name: ShoppingText });
export type RememberBarcodeInput = z.infer<typeof RememberBarcodeInput>;
