import type {
  MealDto,
  MealInput,
  MealsToShoppingDto,
  MealSuggestionDto,
  UpdateMealInput,
} from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const mealKeys = {
  all: (hid: string) => ['households', hid, 'meals'] as const,
  range: (hid: string, from: string, to: string) => ['households', hid, 'meals', from, to] as const,
};

export const useMeals = (hid: string, from: string, to: string) =>
  useQuery({
    queryKey: mealKeys.range(hid, from, to),
    queryFn: () => api<MealDto[]>(`/v1/households/${hid}/meals?from=${from}&to=${to}`),
  });

export const useMealSuggestions = (hid: string) =>
  useQuery({
    queryKey: [...mealKeys.all(hid), 'suggestions'],
    queryFn: () => api<MealSuggestionDto[]>(`/v1/households/${hid}/meals/suggestions`),
  });

export function useMealActions(hid: string) {
  const qc = useQueryClient();
  const base = `/v1/households/${hid}/meals`;
  const invalidate = () => qc.invalidateQueries({ queryKey: mealKeys.all(hid) });
  return {
    save: useMutation({
      mutationFn: ({ id, ...input }: MealInput & { id?: string }) =>
        id
          ? api<MealDto>(`${base}/${id}`, {
              method: 'PATCH',
              json: input satisfies UpdateMealInput,
            })
          : api<MealDto>(base, { method: 'POST', json: input }),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
      onSettled: invalidate,
    }),
    toShopping: useMutation({
      mutationFn: (mealIds: string[]) =>
        api<MealsToShoppingDto>(`${base}/shopping`, { method: 'POST', json: { mealIds } }),
      onSettled: () =>
        Promise.all([
          invalidate(),
          qc.invalidateQueries({ queryKey: ['households', hid, 'shopping'] }),
        ]),
    }),
  };
}

/** Ingrédients saisis un par ligne (ou séparés par des virgules). */
export const splitIngredients = (text: string) =>
  text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
