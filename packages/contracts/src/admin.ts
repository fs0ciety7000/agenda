import { z } from 'zod';
import { Email } from './auth';

/** Administration de l'instance (réservée aux adresses ADMIN_EMAILS). */

export const BackupRunDto = z.object({
  id: z.uuid(),
  trigger: z.string(),
  status: z.enum(['PENDING', 'RUNNING', 'OK', 'FAILED']),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  file: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  summary: z.string().nullable(),
  offsite: z.boolean(),
});
export type BackupRunDto = z.infer<typeof BackupRunDto>;

export const AdminOverviewDto = z.object({
  counts: z.object({
    users: z.number().int(),
    disabledUsers: z.number().int(),
    households: z.number().int(),
    tasks: z.number().int(),
    openOccurrences: z.number().int(),
    doneLast7Days: z.number().int(),
    shoppingItems: z.number().int(),
    comments: z.number().int(),
    attachments: z.number().int(),
    /** Signalements à traiter (ouverts ou en cours). */
    openReports: z.number().int(),
  }),
  storage: z.object({ databaseBytes: z.number(), attachmentsBytes: z.number() }),
  /** Événements Google Calendar par état (SYNCED, PENDING, ERROR, BLOCKED…). */
  calendar: z.record(z.string(), z.number().int()),
  /** Fonctions configurées sur le serveur. */
  integrations: z.array(z.object({ key: z.string(), enabled: z.boolean() })),
  registrationEnabled: z.boolean(),
  backups: z.array(BackupRunDto),
  serverTime: z.string(),
  uptimeSeconds: z.number().int(),
});
export type AdminOverviewDto = z.infer<typeof AdminOverviewDto>;

export const AdminUserDto = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  locale: z.string(),
  createdAt: z.string(),
  /** Dernière activité (rafraîchissement de session le plus récent). */
  lastSeenAt: z.string().nullable(),
  activeSessions: z.number().int(),
  hasPassword: z.boolean(),
  googleLinked: z.boolean(),
  households: z.array(z.string()),
  disabled: z.boolean(),
  isAdmin: z.boolean(),
});
export type AdminUserDto = z.infer<typeof AdminUserDto>;

export const AdminHouseholdDto = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.string(),
  members: z.array(
    z.object({ displayName: z.string(), email: z.string().nullable(), role: z.string() }),
  ),
  tasks: z.number().int(),
  openOccurrences: z.number().int(),
  attachmentsBytes: z.number(),
  lastActivityAt: z.string().nullable(),
});
export type AdminHouseholdDto = z.infer<typeof AdminHouseholdDto>;

/** Compte créé par un administrateur : un lien « choisir mon mot de passe » est envoyé. */
export const AdminCreateUserInput = z.object({
  email: Email,
  displayName: z.string().trim().min(1).max(60),
  locale: z.enum(['fr', 'en']).default('fr'),
});
export type AdminCreateUserInput = z.infer<typeof AdminCreateUserInput>;

/** Résultat d'un test (e-mail, notification). */
export const AdminTestResultDto = z.object({ ok: z.boolean(), detail: z.string().nullable() });
export type AdminTestResultDto = z.infer<typeof AdminTestResultDto>;
