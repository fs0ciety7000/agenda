import { z } from 'zod';

/**
 * Signalements (bug, idée, question) envoyés depuis le site ou l'app, traités dans
 * l'administration. Minimisation des données (RGPD) : les informations techniques ne sont
 * jointes que si l'utilisateur le choisit, et ne contiennent jamais de contenu de tâche.
 */
export const ReportKind = z.enum(['BUG', 'IDEA', 'QUESTION', 'OTHER']);
export type ReportKind = z.infer<typeof ReportKind>;

export const ReportStatus = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
export type ReportStatus = z.infer<typeof ReportStatus>;

/** Capture d'écran jointe : 5 Mo au plus, images seulement. */
export const REPORT_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const REPORT_SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** Signalements par compte et par 24 h (anti-abus). */
export const REPORTS_PER_DAY = 10;
/** Un signalement résolu ou fermé est effacé après ce délai. */
export const REPORT_RETENTION_DAYS = 180;

/** Informations techniques (facultatives, affichées à l'utilisateur avant l'envoi). */
export const ReportDiagnostics = z
  .object({
    platform: z.enum(['web', 'android']),
    appVersion: z.string().max(40).nullish(),
    /** « Android 15 », « Windows »… */
    os: z.string().max(80).nullish(),
    /** Modèle d'appareil (Android) : « Pixel 8 ». */
    device: z.string().max(80).nullish(),
    /** Navigateur (web) : agent utilisateur. */
    browser: z.string().max(300).nullish(),
    locale: z.string().max(20).nullish(),
    timezone: z.string().max(60).nullish(),
    /** Taille d'écran : « 390×844 ». */
    screen: z.string().max(20).nullish(),
    /** Page ou écran en cours, sans paramètres (jamais d'identifiant de tâche). */
    page: z.string().max(200).nullish(),
    online: z.boolean().nullish(),
    /** Modifications hors ligne en attente d'envoi. */
    pendingChanges: z.number().int().min(0).max(100_000).nullish(),
  })
  .strict();
export type ReportDiagnostics = z.infer<typeof ReportDiagnostics>;

export const CreateReportInput = z.object({
  kind: ReportKind,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  /** Accepte d'être recontacté·e par e-mail (adresse du compte). */
  allowContact: z.boolean().default(false),
  /** Présent seulement si l'utilisateur a coché « joindre les informations techniques ». */
  diagnostics: ReportDiagnostics.nullish(),
});
export type CreateReportInput = z.infer<typeof CreateReportInput>;

export const ReportDto = z.object({
  id: z.uuid(),
  kind: ReportKind,
  status: ReportStatus,
  title: z.string(),
  description: z.string(),
  allowContact: z.boolean(),
  diagnostics: ReportDiagnostics.nullable(),
  hasScreenshot: z.boolean(),
  /** Réponse de l'administrateur. */
  reply: z.string().nullable(),
  repliedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReportDto = z.infer<typeof ReportDto>;

export const AdminReportDto = ReportDto.extend({
  author: z.object({ displayName: z.string(), email: z.string() }),
});
export type AdminReportDto = z.infer<typeof AdminReportDto>;

export const AdminReportsQuery = z.object({
  status: z.enum(['ACTIVE', 'ALL', ...ReportStatus.options]).default('ACTIVE'),
});
export type AdminReportsQuery = z.infer<typeof AdminReportsQuery>;

export const AdminUpdateReportInput = z
  .object({
    status: ReportStatus.optional(),
    /** Réponse visible par l'auteur (et envoyée par e-mail s'il l'a accepté). */
    reply: z.string().trim().min(1).max(5000).optional(),
  })
  .refine((v) => v.status !== undefined || v.reply !== undefined, 'Nothing to update');
export type AdminUpdateReportInput = z.infer<typeof AdminUpdateReportInput>;
