import { z } from 'zod';
import { IsoDate } from './tasks';

/** Une tâche d'un modèle (« Ménage du samedi » → aspirateur, salle de bain, draps…). */
export const TemplateItem = z.object({
  title: z.string().trim().min(1).max(200),
  categoryId: z.uuid().nullish(),
  /** Responsables ; vide = à définir. Les membres partis sont ignorés à l'application. */
  assigneeIds: z.array(z.uuid()).max(20).default([]),
  startMinute: z.number().int().min(0).max(1439).nullish(),
  durationMinutes: z.number().int().min(1).max(1440).nullish(),
  checklist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
});
export type TemplateItem = z.infer<typeof TemplateItem>;

export const TemplateInput = z.object({
  name: z.string().trim().min(1).max(80),
  emoji: z.string().trim().max(8).nullish(),
  items: z.array(TemplateItem).min(1).max(30),
});
export type TemplateInput = z.infer<typeof TemplateInput>;

export const TaskTemplateDto = z.object({
  id: z.uuid(),
  name: z.string(),
  emoji: z.string().nullable(),
  items: z.array(TemplateItem),
});
export type TaskTemplateDto = z.infer<typeof TaskTemplateDto>;

/** Créer les tâches du modèle, pour un jour donné (sans date si absent). */
export const ApplyTemplateInput = z.object({
  date: IsoDate.nullish(),
  /** Publier dans le calendrier partagé (défaut : oui si un calendrier est lié). */
  syncToCalendar: z.boolean().optional(),
});
export type ApplyTemplateInput = z.infer<typeof ApplyTemplateInput>;

/** Historique d'une tâche récurrente : qui l'a faite, et quand. */
export const SeriesHistoryItem = z.object({
  occurrenceId: z.uuid(),
  date: IsoDate.nullable(),
  status: z.enum(['DONE', 'SKIPPED', 'TODO']),
  completedAt: z.string().nullable(),
  completedById: z.uuid().nullable(),
  assigneeIds: z.array(z.uuid()),
});
export type SeriesHistoryItem = z.infer<typeof SeriesHistoryItem>;

export const SeriesHistoryDto = z.object({
  items: z.array(SeriesHistoryItem),
  /** Nombre de fois faite par membre (sur tout l'historique). */
  doneBy: z.array(z.object({ memberId: z.uuid(), count: z.number().int() })),
});
export type SeriesHistoryDto = z.infer<typeof SeriesHistoryDto>;
