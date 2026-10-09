import { z } from 'zod';

/** Nombre de notes par foyer (mémos courts, pas un traitement de texte). */
export const MAX_NOTES = 200;

/** Note partagée du foyer : code Wi-Fi, mesures, idées cadeaux… Tout le monde peut la modifier. */
export const NoteInput = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(4000).default(''),
  pinned: z.boolean().default(false),
  /** Note sensible (code Wi-Fi, digicode) : contenu masqué, affiché après vérification. */
  secret: z.boolean().default(false),
});
export type NoteInput = z.infer<typeof NoteInput>;

/** Modification : `version` vient de la note lue ; si elle a changé entre-temps, 409. */
export const UpdateNoteInput = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().max(4000).optional(),
  pinned: z.boolean().optional(),
  secret: z.boolean().optional(),
  version: z.number().int().min(1),
});
export type UpdateNoteInput = z.infer<typeof UpdateNoteInput>;

export const NoteDto = z.object({
  id: z.uuid(),
  title: z.string(),
  /** Vide pour une note sensible : le contenu ne s'obtient que par `…/reveal`. */
  body: z.string(),
  pinned: z.boolean(),
  secret: z.boolean(),
  createdById: z.uuid().nullable(),
  updatedById: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type NoteDto = z.infer<typeof NoteDto>;

/** Versions gardées par note : au-delà, les plus anciennes sont effacées. */
export const MAX_NOTE_REVISIONS = 20;

/**
 * Version précédente d'une note, gardée à chaque modification du titre ou du texte : on peut la
 * revoir et la restaurer si l'autre l'a écrasée. `editedById` : qui avait écrit cette version.
 */
export const NoteRevisionDto = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  version: z.number().int(),
  editedById: z.uuid().nullable(),
  /** Moment où cette version avait été enregistrée. */
  savedAt: z.string(),
});
export type NoteRevisionDto = z.infer<typeof NoteRevisionDto>;

/** Restaurer une version : `version` est celle de la note affichée (409 si elle a changé). */
export const RestoreNoteRevisionInput = z.object({ version: z.number().int().min(1) });
export type RestoreNoteRevisionInput = z.infer<typeof RestoreNoteRevisionInput>;

/**
 * Afficher le contenu d'une note sensible. Sur le site : le mot de passe du compte, ou `confirm`
 * pour un compte sans mot de passe (connexion Google) ; le coffre reste ensuite ouvert 5 minutes
 * pour cette session. Sur Android, l'empreinte ou le code du téléphone est vérifié sur l'appareil.
 */
export const RevealNoteInput = z.object({
  password: z.string().max(200).optional(),
  confirm: z.boolean().optional(),
});
export type RevealNoteInput = z.infer<typeof RevealNoteInput>;

export const RevealedNoteDto = z.object({ body: z.string() });
export type RevealedNoteDto = z.infer<typeof RevealedNoteDto>;

/** Durée pendant laquelle le coffre reste ouvert après une vérification (site). */
export const VAULT_UNLOCK_MINUTES = 5;
