import { z } from 'zod';

export const HouseholdRole = z.enum(['OWNER', 'MEMBER']);
export type HouseholdRole = z.infer<typeof HouseholdRole>;

/** Visibilité : axe indépendant de l'attribution (cf. docs/product-requirements.md §4). */
export const TaskVisibility = z.enum(['PERSONAL', 'SHARED']);
export type TaskVisibility = z.infer<typeof TaskVisibility>;

export const TaskPriority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const OccurrenceStatus = z.enum(['TODO', 'DONE', 'SKIPPED', 'CANCELLED']);
export type OccurrenceStatus = z.infer<typeof OccurrenceStatus>;

/** Indication d'interface ; le moteur ne lit que les RotationSlot. */
export const RotationMode = z.enum([
  'UNASSIGNED',
  'FIXED',
  'TOGETHER',
  'ALTERNATE',
  'SEQUENCE',
  'WEEKDAY',
]);
export type RotationMode = z.infer<typeof RotationMode>;

export const RotationAdvance = z.enum(['PER_OCCURRENCE', 'PER_WEEK']);
export type RotationAdvance = z.infer<typeof RotationAdvance>;

export const SyncStatus = z.enum([
  'PENDING',
  'SYNCING',
  'SYNCED',
  'ERROR',
  'BLOCKED',
  'PENDING_DELETE',
  'DELETED',
]);
export type SyncStatus = z.infer<typeof SyncStatus>;

export const Locale = z.enum(['fr', 'en']);
export type Locale = z.infer<typeof Locale>;
