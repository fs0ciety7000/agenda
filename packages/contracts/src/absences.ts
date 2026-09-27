import { z } from 'zod';
import { IsoDate } from './tasks';

/**
 * Mode absence : du `startDate` au `endDate` inclus, les tâches partagées du membre passent aux
 * autres (rotation comprise). Ses tâches personnelles ne changent pas.
 */
export const AbsenceDto = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  startDate: IsoDate,
  endDate: IsoDate,
});
export type AbsenceDto = z.infer<typeof AbsenceDto>;

export const CreateAbsenceInput = z
  .object({
    memberId: z.uuid(),
    startDate: IsoDate,
    endDate: IsoDate,
  })
  .refine((a) => a.startDate <= a.endDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });
export type CreateAbsenceInput = z.infer<typeof CreateAbsenceInput>;

/** Durée maximale d'une absence (jours). */
export const ABSENCE_MAX_DAYS = 366;
