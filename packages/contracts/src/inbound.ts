import { z } from 'zod';

/** Créer une tâche en transférant un e-mail à une adresse personnelle. */
export const InboundEmailSettingsDto = z.object({
  /** Fonction activée sur ce serveur (adresse et secret configurés). */
  available: z.boolean(),
  /** Adresse personnelle ; null tant qu'elle n'a pas été créée (ou après désactivation). */
  address: z.string().nullable(),
  /** Accusé de réception « ✓ Tâche créée » envoyé à chaque e-mail. */
  acknowledge: z.boolean(),
});
export type InboundEmailSettingsDto = z.infer<typeof InboundEmailSettingsDto>;

export const InboundEmailSettingsInput = z.object({ acknowledge: z.boolean() });
export type InboundEmailSettingsInput = z.infer<typeof InboundEmailSettingsInput>;

/** Webhook Resend (réception d'e-mails) : seuls les champs utilisés sont validés. */
export const ResendWebhookEvent = z.object({
  type: z.string(),
  data: z
    .object({
      email_id: z.string().max(100).optional(),
      from: z.string().max(500).optional(),
      to: z.array(z.string().max(500)).max(50).optional(),
      received_for: z.array(z.string().max(500)).max(50).optional(),
      subject: z.string().max(1000).optional(),
    })
    .loose()
    .optional(),
});
export type ResendWebhookEvent = z.infer<typeof ResendWebhookEvent>;
