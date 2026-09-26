import { z } from 'zod';
import { OccurrenceStatus, TaskPriority, TaskVisibility } from './enums';

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
  startMinute: StartMinute.nullish(),
  durationMinutes: Duration.nullish(),
};

const timeNeedsDate = (v: { date?: string | null; startMinute?: number | null }) =>
  v.startMinute == null || v.date != null;

export const CreateTaskInput = z
  .object({
    ...taskFields,
    priority: taskFields.priority.default('NORMAL'),
    visibility: taskFields.visibility.default('SHARED'),
    assigneeIds: taskFields.assigneeIds.default([]),
  })
  .refine(timeNeedsDate, { message: 'startMinute requires date', path: ['startMinute'] });
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
  startMinute: z.number().int().nullable(),
  durationMinutes: z.number().int().nullable(),
  assigneeIds: z.array(z.uuid()),
  createdById: z.uuid(),
  isRecurring: z.boolean(),
  completedAt: z.string().nullable(),
  completedById: z.uuid().nullable(),
  version: z.number().int(),
});
export type OccurrenceDto = z.infer<typeof OccurrenceDto>;

export const QuickAddPreview = z.object({
  title: z.string(),
  date: IsoDate.optional(),
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
