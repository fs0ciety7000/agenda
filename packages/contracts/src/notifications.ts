import { z } from 'zod';

/** Types proposés aux utilisateurs (les autres types du schéma ne sont pas encore émis). */
export const NotificationKind = z.enum([
  'TASK_ASSIGNED',
  'CALENDAR_SYNC_FAILED',
  'TASK_COMMENT',
  'TASK_THANKS',
  'EXPENSE_BUDGET',
  'TASK_SWAP_REQUEST',
  'TASK_SWAP_ANSWER',
  'IMPORTANT_DATE',
]);
export type NotificationKind = z.infer<typeof NotificationKind>;

export const NotificationDto = z.object({
  id: z.uuid(),
  type: NotificationKind,
  createdAt: z.string(),
  readAt: z.string().nullable(),
  /** À afficher aussi sur le téléphone (préférence « push » au moment de la création). */
  push: z.boolean(),
  /** TASK_ASSIGNED, TASK_COMMENT, TASK_THANKS : tâche concernée (null si supprimée entre-temps). */
  occurrenceId: z.uuid().nullable(),
  title: z.string().nullable(),
  date: z.string().nullable(),
  recurring: z.boolean(),
  /** Qui a fait l'action (prénom), si applicable. */
  byName: z.string().nullable(),
  /** CALENDAR_SYNC_FAILED : code d'erreur (CalendarErrorCode) ; TASK_SWAP_ANSWER : ACCEPTED ou DECLINED. */
  code: z.string().nullable(),
  /** EXPENSE_BUDGET : mois (« 2026-10 »), seuil atteint (80 ou 100), dépensé et budget. */
  month: z.string().nullable(),
  level: z.number().int().nullable(),
  amountCents: z.number().int().nullable(),
  budgetCents: z.number().int().nullable(),
  /** EXPENSE_BUDGET : catégorie du budget atteint (null = budget global du mois). */
  category: z.string().nullable(),
  /** IMPORTANT_DATE : jours restants avant la date (0 = aujourd'hui) ; titre et date ci-dessus. */
  daysLeft: z.number().int().nullable(),
});
export type NotificationDto = z.infer<typeof NotificationDto>;

export const NotificationListDto = z.object({
  unread: z.number().int(),
  items: z.array(NotificationDto),
});
export type NotificationListDto = z.infer<typeof NotificationListDto>;

export const NotificationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  /** Android : uniquement les notifications plus récentes (ISO 8601). */
  since: z.iso.datetime().optional(),
});
export type NotificationQuery = z.infer<typeof NotificationQuery>;

export const MarkReadInput = z.object({ ids: z.array(z.uuid()).max(100).optional() });
export type MarkReadInput = z.infer<typeof MarkReadInput>;

export const NotificationPreferenceDto = z.object({
  type: NotificationKind,
  /** Visible dans la cloche du site / de l'app. */
  inApp: z.boolean(),
  /** Notification sur le téléphone (app Android). */
  push: z.boolean(),
});
export type NotificationPreferenceDto = z.infer<typeof NotificationPreferenceDto>;

export const UpdatePreferencesInput = z.object({
  preferences: z.array(NotificationPreferenceDto).min(1).max(10),
});
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesInput>;

/** Diagnostic des notifications instantanées pour le compte connecté. */
export const PushStatusDto = z.object({
  /** Le serveur peut envoyer (FCM_SERVICE_ACCOUNT valide). */
  serverEnabled: z.boolean(),
  /** Raison si désactivé : non configuré, ou configuration illisible. */
  serverIssue: z.enum(['NOT_CONFIGURED', 'INVALID_CONFIG']).nullable(),
  /** Téléphones de ce compte enregistrés pour les recevoir. */
  devices: z.number().int(),
  lastRegisteredAt: z.string().nullable(),
});
export type PushStatusDto = z.infer<typeof PushStatusDto>;

/** Jeton Firebase d'un téléphone (notifications instantanées). */
export const PushTokenInput = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(['android']).default('android'),
});
export type PushTokenInput = z.infer<typeof PushTokenInput>;

/** Notifications du site : clé publique VAPID (null = non configuré sur le serveur). */
export const WebPushKeyDto = z.object({ publicKey: z.string().nullable() });
export type WebPushKeyDto = z.infer<typeof WebPushKeyDto>;

/** `PushSubscription.toJSON()` du navigateur. */
export const WebPushSubscriptionInput = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine((u) => u.startsWith('https://'), 'https required'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type WebPushSubscriptionInput = z.infer<typeof WebPushSubscriptionInput>;

export const WebPushUnsubscribeInput = z.object({ endpoint: z.string().max(2048) });
export type WebPushUnsubscribeInput = z.infer<typeof WebPushUnsubscribeInput>;
