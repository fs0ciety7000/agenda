import { z } from 'zod';

/**
 * Sous-ensemble typé de RRULE (RFC 5545). Voir docs/database.md §4.
 * Le moteur (@agenda/domain) n'accepte que ce qui est décrit ici.
 */
export const Weekday = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
export type Weekday = z.infer<typeof Weekday>;

export const RecurrenceRule = z.discriminatedUnion('freq', [
  z
    .object({
      freq: z.literal('DAILY'),
      interval: z.number().int().min(1).max(365).default(1),
      weekdaysOnly: z.boolean().default(false),
    })
    .refine((r) => !r.weekdaysOnly || r.interval === 1, 'weekdaysOnly requires interval 1'),
  z.object({
    freq: z.literal('WEEKLY'),
    interval: z.number().int().min(1).max(52).default(1),
    byWeekday: z.array(Weekday).min(1).max(7),
  }),
  z.object({
    freq: z.literal('MONTHLY'),
    interval: z.number().int().min(1).max(24).default(1),
    /** 1..31, ou -1 pour « dernier jour du mois ». */
    byMonthDay: z
      .number()
      .int()
      .min(-1)
      .max(31)
      .refine((d) => d !== 0),
  }),
  z.object({
    freq: z.literal('YEARLY'),
    interval: z.number().int().min(1).max(10).default(1),
  }),
]);
export type RecurrenceRule = z.infer<typeof RecurrenceRule>;

const MemberIds = z.array(z.uuid()).max(20);
/** Une étape de rotation = un ou plusieurs membres (plusieurs = « à deux » pour ce tour). */
const Sequence = z.array(MemberIds.min(1)).min(1).max(14);

/** Modes de rotation (convertis en RotationSlot par @agenda/domain). */
export const RotationInput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('UNASSIGNED') }),
  z.object({ mode: z.literal('FIXED'), memberIds: MemberIds.min(1) }),
  z.object({ mode: z.literal('TOGETHER'), memberIds: MemberIds.min(2) }),
  z.object({ mode: z.literal('ALTERNATE'), memberIds: MemberIds.min(2) }),
  z.object({ mode: z.literal('SEQUENCE'), sequence: Sequence }),
  z.object({
    mode: z.literal('WEEKDAY'),
    days: z
      .array(z.object({ weekday: z.number().int().min(0).max(6), sequence: Sequence }))
      .min(1)
      .max(7),
    fallback: Sequence.optional(),
  }),
]);
export type RotationInput = z.infer<typeof RotationInput>;

export const RotationAdvanceInput = z.enum(['PER_OCCURRENCE', 'PER_WEEK']);

export const RecurrenceInput = z.object({
  rule: RecurrenceRule,
  /** Dernière date incluse. */
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  count: z.number().int().min(1).max(1000).nullish(),
  rotation: RotationInput.default({ mode: 'UNASSIGNED' }),
  advance: RotationAdvanceInput.default('PER_OCCURRENCE'),
});
export type RecurrenceInput = z.infer<typeof RecurrenceInput>;

/** Portée d'une modification / suppression d'une tâche récurrente. */
export const EditScope = z.enum(['this', 'following', 'all']);
export type EditScope = z.infer<typeof EditScope>;
export const ScopeQuery = z.object({ scope: EditScope.default('this') });
export type ScopeQuery = z.infer<typeof ScopeQuery>;
