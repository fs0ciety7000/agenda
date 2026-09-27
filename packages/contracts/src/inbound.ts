import { z } from 'zod';

/** Créer une tâche en transférant un e-mail à une adresse personnelle. */
export const InboundEmailSettingsDto = z.object({
  /** Fonction activée sur ce serveur (adresse et secret configurés). */
  available: z.boolean(),
  /** Adresse personnelle ; null tant qu'elle n'a pas été créée (ou après désactivation). */
  address: z.string().nullable(),
});
export type InboundEmailSettingsDto = z.infer<typeof InboundEmailSettingsDto>;

/** Envoyé par le Worker Cloudflare qui reçoit les e-mails (infra/email-worker). */
export const InboundEmailInput = z.object({
  /** Destinataire(s) tels que reçus : l'adresse personnelle y figure. */
  to: z.string().max(2000),
  from: z.string().max(500).default(''),
  subject: z.string().max(1000).default(''),
  /** Corps en texte brut (déjà extrait du MIME). */
  text: z.string().max(200_000).default(''),
});
export type InboundEmailInput = z.infer<typeof InboundEmailInput>;
