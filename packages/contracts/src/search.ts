import { z } from 'zod';
import { ImportantDateKind } from './important-dates';

/** Recherche globale du foyer : au moins 2 caractères. */
export const SearchQuery = z.object({ q: z.string().trim().min(2).max(100) });
export type SearchQuery = z.infer<typeof SearchQuery>;

/**
 * Résultats groupés (8 au plus par groupe). Une tâche renvoie l'occurrence à ouvrir : la
 * prochaine à faire, sinon la plus récente. Les tâches et dépenses personnelles de l'autre
 * n'apparaissent jamais.
 */
export const SearchResultsDto = z.object({
  tasks: z.array(
    z.object({
      occurrenceId: z.uuid(),
      title: z.string(),
      date: z.string().nullable(),
      done: z.boolean(),
    }),
  ),
  notes: z.array(z.object({ id: z.uuid(), title: z.string(), snippet: z.string() })),
  dates: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      kind: ImportantDateKind,
      month: z.number().int(),
      day: z.number().int(),
    }),
  ),
  expenses: z.array(
    z.object({ id: z.uuid(), title: z.string(), date: z.string(), amountCents: z.number().int() }),
  ),
  shopping: z.array(z.object({ id: z.uuid(), text: z.string(), done: z.boolean() })),
});
export type SearchResultsDto = z.infer<typeof SearchResultsDto>;
