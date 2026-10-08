import { z } from 'zod';

/** Nombre de notes par foyer (mémos courts, pas un traitement de texte). */
export const MAX_NOTES = 200;

/** Note partagée du foyer : code Wi-Fi, mesures, idées cadeaux… Tout le monde peut la modifier. */
export const NoteInput = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(4000).default(''),
  pinned: z.boolean().default(false),
});
export type NoteInput = z.infer<typeof NoteInput>;

/** Modification : `version` vient de la note lue ; si elle a changé entre-temps, 409. */
export const UpdateNoteInput = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().max(4000).optional(),
  pinned: z.boolean().optional(),
  version: z.number().int().min(1),
});
export type UpdateNoteInput = z.infer<typeof UpdateNoteInput>;

export const NoteDto = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  pinned: z.boolean(),
  createdById: z.uuid().nullable(),
  updatedById: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type NoteDto = z.infer<typeof NoteDto>;
