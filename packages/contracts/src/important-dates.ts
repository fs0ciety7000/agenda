import { z } from 'zod';
import { IsoDate } from './tasks';

/** Dates importantes par foyer (anniversaires, fêtes, entretiens annuels). */
export const MAX_IMPORTANT_DATES = 200;

export const ImportantDateKind = z.enum(['BIRTHDAY', 'ANNIVERSARY', 'MAINTENANCE', 'OTHER']);
export type ImportantDateKind = z.infer<typeof ImportantDateKind>;

const fields = {
  title: z.string().trim().min(1).max(120),
  kind: ImportantDateKind,
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  /** Année d'origine (naissance, mariage) : affiche l'âge. Obligatoire pour une date unique. */
  year: z.number().int().min(1900).max(2200).nullish(),
  repeatsYearly: z.boolean(),
  /** Rappel envoyé à tout le foyer N jours avant (0 = le jour même). */
  remindDaysBefore: z.number().int().min(0).max(60),
};

const validDay = (d: { month: number; day: number }) =>
  d.day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][d.month - 1]!;

export const ImportantDateInput = z
  .object({
    ...fields,
    kind: fields.kind.default('OTHER'),
    repeatsYearly: fields.repeatsYearly.default(true),
    remindDaysBefore: fields.remindDaysBefore.default(7),
  })
  .refine(validDay, { path: ['day'], message: 'Invalid day for this month' })
  .refine((d) => d.repeatsYearly || d.year != null, {
    path: ['year'],
    message: 'Year required for a one-off date',
  });
export type ImportantDateInput = z.infer<typeof ImportantDateInput>;

export const ImportantDateDto = z.object({
  id: z.uuid(),
  ...fields,
  year: z.number().int().nullable(),
  createdById: z.uuid().nullable(),
  /** Prochaine occurrence (null : date unique passée). */
  nextDate: IsoDate.nullable(),
  daysLeft: z.number().int().nullable(),
  /** Âge ou années écoulées à la prochaine occurrence, si l'année est connue. */
  years: z.number().int().nullable(),
});
export type ImportantDateDto = z.infer<typeof ImportantDateDto>;
