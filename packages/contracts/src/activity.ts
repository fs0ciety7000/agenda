import { z } from 'zod';
import { IsoDate } from './tasks';

/** Journal d'activité du foyer (qui a fait quoi, quand). Les tâches personnelles de l'autre n'y figurent pas. */
export const ActivityDto = z.object({
  id: z.uuid(),
  /** Ex. `task.created`, `occurrence.completed`, `task.deleted`, `task.restored`… */
  action: z.string(),
  at: z.string(),
  /** null : action automatique (Google Calendar, purge). */
  actorId: z.uuid().nullable(),
  /** Titre au moment de l'action (reste lisible après suppression). */
  title: z.string().nullable(),
  /** Date de l'occurrence concernée, si pertinente. */
  date: IsoDate.nullable(),
  /** Champs modifiés (`occurrence.updated`, `series.updated`). */
  fields: z.array(z.string()),
});
export type ActivityDto = z.infer<typeof ActivityDto>;

export const ActivityQuery = z.object({
  /** Curseur : identifiant de la dernière entrée de la page précédente. */
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type ActivityQuery = z.infer<typeof ActivityQuery>;

export const ActivityPageDto = z.object({
  items: z.array(ActivityDto),
  /** Curseur de la page suivante, null en fin de journal. */
  next: z.uuid().nullable(),
});
export type ActivityPageDto = z.infer<typeof ActivityPageDto>;

/** Élément de la corbeille (30 jours). */
export const TrashKind = z.enum(['task', 'occurrence', 'following']);
export type TrashKind = z.infer<typeof TrashKind>;

export const TrashItemDto = z.object({
  /** Identifiant de l'entrée du journal qui a supprimé l'élément : sert à le restaurer. */
  id: z.uuid(),
  /** `task` : tâche entière ; `occurrence` : une seule fois ; `following` : fin d'une répétition. */
  kind: TrashKind,
  title: z.string(),
  date: IsoDate.nullable(),
  deletedAt: z.string(),
  deletedById: z.uuid().nullable(),
  /** Suppression définitive à cette date. */
  purgeAt: z.string(),
});
export type TrashItemDto = z.infer<typeof TrashItemDto>;

export const TRASH_RETENTION_DAYS = 30;
export const ACTIVITY_RETENTION_DAYS = 365;
