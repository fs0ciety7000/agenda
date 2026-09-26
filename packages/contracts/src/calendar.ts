import { z } from 'zod';

export const CalendarSyncState = z.enum(['SYNCED', 'PENDING', 'ERROR', 'BLOCKED']);
export type CalendarSyncState = z.infer<typeof CalendarSyncState>;

/** Codes d'erreur de synchronisation, traduits côté client en messages compréhensibles. */
export const CalendarErrorCode = z.enum([
  'CALENDAR_READ_ONLY',
  'CALENDAR_NOT_FOUND',
  'GOOGLE_REVOKED',
  'CALENDAR_RATE_LIMITED',
  'CALENDAR_UNAVAILABLE',
]);
export type CalendarErrorCode = z.infer<typeof CalendarErrorCode>;

export const CalendarStatusDto = z.object({
  /** Intégration configurée côté serveur (client OAuth + clé de chiffrement). */
  configured: z.boolean(),
  /** Connexion Google Calendar de l'utilisateur courant. */
  connection: z
    .object({ id: z.uuid(), email: z.string(), status: z.enum(['ACTIVE', 'REVOKED', 'ERROR']) })
    .nullable(),
  /** Calendrier partagé du foyer (ex. « Commun G & N »). */
  link: z
    .object({
      calendarId: z.string(),
      summary: z.string(),
      accessRole: z.string(),
      status: z.enum(['ACTIVE', 'INVALID']),
      errorCode: CalendarErrorCode.nullable(),
      connectedByMe: z.boolean(),
      connectedBy: z.string().nullable(),
      connectionEmail: z.string(),
      lastReconciledAt: z.string().nullable(),
    })
    .nullable(),
  stats: z.object({
    synced: z.number().int(),
    pending: z.number().int(),
    errors: z.number().int(),
  }),
});
export type CalendarStatusDto = z.infer<typeof CalendarStatusDto>;

export const AvailableCalendarDto = z.object({
  id: z.string(),
  summary: z.string(),
  accessRole: z.string(),
  primary: z.boolean(),
  /** owner ou writer : seul un calendrier modifiable peut être choisi. */
  writable: z.boolean(),
  color: z.string().nullable(),
});
export type AvailableCalendarDto = z.infer<typeof AvailableCalendarDto>;

export const LinkCalendarInput = z.object({ calendarId: z.string().min(1).max(255) });
export type LinkCalendarInput = z.infer<typeof LinkCalendarInput>;

export const UnlinkCalendarQuery = z.object({
  /** Supprimer aussi les événements déjà créés dans Google Calendar. */
  removeEvents: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
export type UnlinkCalendarQuery = z.infer<typeof UnlinkCalendarQuery>;
