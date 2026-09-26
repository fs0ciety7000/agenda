import { z } from 'zod';

/**
 * Sous-ensemble typé de RRULE (RFC 5545). Voir docs/database.md §4.
 * Le moteur (Phase 3) n'accepte que ce qui est décrit ici.
 */
export const Weekday = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
export type Weekday = z.infer<typeof Weekday>;

export const RecurrenceRule = z.discriminatedUnion('freq', [
  z.object({
    freq: z.literal('DAILY'),
    interval: z.number().int().min(1).max(365).default(1),
    weekdaysOnly: z.boolean().default(false),
  }),
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
