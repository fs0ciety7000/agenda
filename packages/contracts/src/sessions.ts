import { z } from 'zod';

/** Type d'appareil d'une connexion, déduit de l'en-tête User-Agent. */
export const DeviceKind = z.enum(['ANDROID_APP', 'BROWSER', 'OTHER']);
export type DeviceKind = z.infer<typeof DeviceKind>;

/**
 * Une connexion active (« Appareils connectés ») : une famille de sessions, de la connexion à la
 * dernière activité. `id` sert à la déconnecter à distance.
 */
export const DeviceSessionDto = z.object({
  id: z.uuid(),
  kind: DeviceKind,
  /** « Chrome », « Firefox », « Safari »… (null si inconnu). */
  browser: z.string().nullable(),
  /** « Android 14 », « Windows », « macOS », « iOS »… (null si inconnu). */
  os: z.string().nullable(),
  /** Version de l'app Android, le cas échéant. */
  appVersion: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  /** La connexion qui fait la requête. */
  current: z.boolean(),
});
export type DeviceSessionDto = z.infer<typeof DeviceSessionDto>;
