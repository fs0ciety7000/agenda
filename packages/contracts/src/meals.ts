import { z } from 'zod';
import { IsoDate } from './tasks';

/** Menus de la semaine : un repas par jour et par moment, avec ses ingrédients. */
export const MealSlot = z.enum(['LUNCH', 'DINNER']);
export type MealSlot = z.infer<typeof MealSlot>;

export const MAX_INGREDIENTS = 40;
const Ingredient = z.string().trim().min(1).max(200);

export const MealDto = z.object({
  id: z.uuid(),
  date: IsoDate,
  slot: MealSlot,
  title: z.string(),
  ingredients: z.array(z.string()),
  /** Ingrédients déjà envoyés à la liste de courses (null = jamais). */
  addedToShoppingAt: z.string().nullable(),
});
export type MealDto = z.infer<typeof MealDto>;

export const MealInput = z.object({
  date: IsoDate,
  slot: MealSlot,
  title: z.string().trim().min(1).max(120),
  ingredients: z.array(Ingredient).max(MAX_INGREDIENTS).default([]),
});
export type MealInput = z.infer<typeof MealInput>;

export const UpdateMealInput = MealInput.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: 'nothing to update' },
);
export type UpdateMealInput = z.infer<typeof UpdateMealInput>;

export const MealsQuery = z
  .object({ from: IsoDate, to: IsoDate })
  .refine((q) => q.from <= q.to, { message: 'from must be before to', path: ['to'] });
export type MealsQuery = z.infer<typeof MealsQuery>;

/** Envoyer les ingrédients de ces repas à la liste de courses (sans doublons). */
export const MealsToShoppingInput = z.object({ mealIds: z.array(z.uuid()).min(1).max(30) });
export type MealsToShoppingInput = z.infer<typeof MealsToShoppingInput>;

export const MealsToShoppingDto = z.object({
  /** Ajoutés à la liste. */
  added: z.number().int(),
  /** Déjà sur la liste (non cochés) : pas ajoutés deux fois. */
  skipped: z.number().int(),
});
export type MealsToShoppingDto = z.infer<typeof MealsToShoppingDto>;

/** Repas déjà cuisinés, pour les reprendre en un geste. */
export const MealSuggestionDto = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  times: z.number().int(),
});
export type MealSuggestionDto = z.infer<typeof MealSuggestionDto>;
