import { z } from 'zod';
import { OccurrenceStatus, TaskPriority, TaskVisibility } from './enums';
import { RecurrenceInput, RecurrenceRule, RotationInput } from './recurrence';

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), 'Invalid date');

const Title = z.string().trim().min(1).max(200);
const Notes = z.string().trim().max(5000);
const StartMinute = z.number().int().min(0).max(1439);
const Duration = z.number().int().min(1).max(1440);

const taskFields = {
  title: Title,
  notes: Notes.nullish(),
  categoryId: z.uuid().nullish(),
  priority: TaskPriority,
  visibility: TaskVisibility,
  /** 0 = à définir, 1 = assignée, 2+ = à deux. Ignoré pour une tâche personnelle (= créateur). */
  assigneeIds: z.array(z.uuid()).max(20),
  date: IsoDate.nullish(),
  /** Échéance souple sans date précise (« cette semaine », « ce mois-ci ») ; ignorée si `date`. */
  dueDate: IsoDate.nullish(),
  startMinute: StartMinute.nullish(),
  durationMinutes: Duration.nullish(),
  /** Tâche récurrente : les responsables viennent alors de la rotation (assigneeIds ignoré). */
  recurrence: RecurrenceInput.nullish(),
  /** « Ajouter au calendrier partagé ». Ignoré (faux) pour une tâche personnelle. */
  syncToCalendar: z.boolean(),
};

const recurrenceNeedsDate = (v: { date?: string | null; recurrence?: unknown }) =>
  !v.recurrence || v.date != null;

const timeNeedsDate = (v: { date?: string | null; startMinute?: number | null }) =>
  v.startMinute == null || v.date != null;

/** Sous-tâches / liste d'une occurrence (ex. « Courses » : lait, pain…). */
export const MAX_CHECKLIST_ITEMS = 100;
const ChecklistText = z.string().trim().min(1).max(200);

export const ChecklistItemDto = z.object({
  id: z.uuid(),
  text: z.string(),
  done: z.boolean(),
  doneById: z.uuid().nullable(),
});
export type ChecklistItemDto = z.infer<typeof ChecklistItemDto>;

export const ChecklistItemInput = z.object({ text: ChecklistText });
export type ChecklistItemInput = z.infer<typeof ChecklistItemInput>;

export const UpdateChecklistItemInput = z
  .object({ text: ChecklistText.optional(), done: z.boolean().optional() })
  .refine((v) => v.text !== undefined || v.done !== undefined, { message: 'nothing to update' });
export type UpdateChecklistItemInput = z.infer<typeof UpdateChecklistItemInput>;

export const CreateTaskInput = z
  .object({
    ...taskFields,
    priority: taskFields.priority.default('NORMAL'),
    visibility: taskFields.visibility.default('SHARED'),
    assigneeIds: taskFields.assigneeIds.default([]),
    syncToCalendar: taskFields.syncToCalendar.default(false),
    /** Sous-tâches / liste (ex. courses), ajoutées à la première occurrence. */
    checklist: z.array(ChecklistText).max(MAX_CHECKLIST_ITEMS).optional(),
  })
  .refine(timeNeedsDate, { message: 'startMinute requires date', path: ['startMinute'] })
  .refine(recurrenceNeedsDate, { message: 'recurrence requires date', path: ['date'] });
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

/** Modification partielle ; `version` = concurrence optimiste (409 si la ressource a changé). */
export const UpdateOccurrenceInput = z
  .object({ ...taskFields, version: z.number().int().min(1) })
  .partial()
  .required({ version: true });
export type UpdateOccurrenceInput = z.infer<typeof UpdateOccurrenceInput>;

export const QuickAddInput = z.object({ text: z.string().trim().min(1).max(500) });
export type QuickAddInput = z.infer<typeof QuickAddInput>;

export const OccurrenceView = z.enum([
  'all',
  'today',
  'upcoming',
  'overdue',
  'unscheduled',
  'done',
]);
export type OccurrenceView = z.infer<typeof OccurrenceView>;

export const OccurrenceQuery = z.object({
  view: OccurrenceView.default('all'),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  /** id de membre, `me`, `unassigned` (à définir) ou `together` (à deux). */
  assignee: z.union([z.uuid(), z.enum(['me', 'unassigned', 'together'])]).optional(),
  categoryId: z.uuid().optional(),
  priority: TaskPriority.optional(),
  status: OccurrenceStatus.optional(),
  visibility: TaskVisibility.optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type OccurrenceQuery = z.infer<typeof OccurrenceQuery>;

/** Fichier joint (métadonnées ; contenu : GET …/attachments/:id). */
export const AttachmentDto = z.object({
  id: z.uuid(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int(),
});
export type AttachmentDto = z.infer<typeof AttachmentDto>;

/** Limites des pièces jointes (octets). */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const HOUSEHOLD_ATTACHMENTS_MAX_BYTES = 200 * 1024 * 1024;

export const OccurrenceDto = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  category: z.object({ id: z.uuid(), name: z.string(), emoji: z.string().nullable() }).nullable(),
  priority: TaskPriority,
  visibility: TaskVisibility,
  status: OccurrenceStatus,
  date: IsoDate.nullable(),
  /** Tâche sans date : à faire au plus tard ce jour-là (en retard ensuite). */
  dueDate: IsoDate.nullable(),
  startMinute: z.number().int().nullable(),
  durationMinutes: z.number().int().nullable(),
  assigneeIds: z.array(z.uuid()),
  createdById: z.uuid(),
  isRecurring: z.boolean(),
  seriesId: z.uuid().nullable(),
  syncToCalendar: z.boolean(),
  /** État de l'événement Google (null = non synchronisée). */
  calendarSync: z.enum(['SYNCED', 'PENDING', 'ERROR', 'BLOCKED']).nullable(),
  /** Occurrence modifiée individuellement dans une série. */
  isException: z.boolean(),
  completedAt: z.string().nullable(),
  completedById: z.uuid().nullable(),
  version: z.number().int(),
  /** Sous-tâches, dans l'ordre. */
  checklist: z.array(ChecklistItemDto),
  /** Fichiers joints à la tâche. */
  attachments: z.array(AttachmentDto),
  /** Tâche récurrente : dernière fois qu'elle a été faite (« fait il y a 5 semaines par Grace »). */
  lastDone: z.object({ at: z.string(), memberId: z.uuid().nullable() }).nullish(),
});
export type OccurrenceDto = z.infer<typeof OccurrenceDto>;

export const QuickAddPreview = z.object({
  title: z.string(),
  date: IsoDate.optional(),
  dueDate: IsoDate.optional(),
  startMinute: z.number().int().optional(),
  durationMinutes: z.number().int().optional(),
  assigneeIds: z.array(z.uuid()).optional(),
  categoryId: z.uuid().optional(),
  priority: TaskPriority.optional(),
  tokens: z.array(z.object({ kind: z.string(), text: z.string() })),
});
export type QuickAddPreview = z.infer<typeof QuickAddPreview>;

/** Répartition factuelle (tâches partagées uniquement), sans classement. */
export const BalanceDto = z.object({
  from: IsoDate,
  to: IsoDate,
  members: z.array(
    z.object({ memberId: z.uuid(), count: z.number().int(), minutes: z.number().int() }),
  ),
  together: z.object({ count: z.number().int(), minutes: z.number().int() }),
  unassigned: z.object({ count: z.number().int(), minutes: z.number().int() }),
});
export type BalanceDto = z.infer<typeof BalanceDto>;

export const BalanceQuery = z.object({ from: IsoDate.optional(), to: IsoDate.optional() });
export type BalanceQuery = z.infer<typeof BalanceQuery>;

export const CategoryInput = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().max(16).nullish(),
});
export type CategoryInput = z.infer<typeof CategoryInput>;

export const UpdateCategoryInput = CategoryInput.partial().extend({
  position: z.number().int().min(0).optional(),
});
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInput>;

export const SeriesDto = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  title: z.string(),
  rule: RecurrenceRule,
  startDate: IsoDate,
  untilDate: IsoDate.nullable(),
  count: z.number().int().nullable(),
  startMinute: z.number().int().nullable(),
  durationMinutes: z.number().int().nullable(),
  rotation: RotationInput,
  advance: z.enum(['PER_OCCURRENCE', 'PER_WEEK']),
  category: z.object({ id: z.uuid(), name: z.string(), emoji: z.string().nullable() }).nullable(),
  visibility: TaskVisibility,
  nextDate: IsoDate.nullable(),
});
export type SeriesDto = z.infer<typeof SeriesDto>;

export const RecurrencePreviewInput = z.object({
  startDate: IsoDate,
  recurrence: RecurrenceInput,
  limit: z.number().int().min(1).max(20).default(6),
});
export type RecurrencePreviewInput = z.infer<typeof RecurrencePreviewInput>;

export const RecurrencePreviewItem = z.object({ date: IsoDate, assigneeIds: z.array(z.uuid()) });
export type RecurrencePreviewItem = z.infer<typeof RecurrencePreviewItem>;

export const StatsQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => d === 7 || d === 30, 'days must be 7 or 30')
    .default(7),
});
export type StatsQuery = z.infer<typeof StatsQuery>;

const StatsShare = z.object({ done: z.number().int(), minutes: z.number().int() });

/** Statistiques factuelles des tâches PARTAGÉES (jamais de classement). */
export const StatsDto = z.object({
  from: IsoDate,
  to: IsoDate,
  days: z.number().int(),
  done: z.number().int(),
  doneMinutes: z.number().int(),
  /** Faites après leur date prévue. */
  doneLate: z.number().int(),
  /** À faire dont la date est passée (aujourd'hui). */
  overdue: z.number().int(),
  perDay: z.array(z.object({ date: IsoDate, done: z.number().int() })),
  byCategory: z.array(
    StatsShare.extend({
      categoryId: z.uuid().nullable(),
      name: z.string().nullable(),
      emoji: z.string().nullable(),
    }),
  ),
  /** Par personne qui a coché la tâche. */
  byMember: z.array(StatsShare.extend({ memberId: z.uuid() })),
});
export type StatsDto = z.infer<typeof StatsDto>;
