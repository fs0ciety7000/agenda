import { z } from 'zod';
import { BACKUP_MAX_BYTES } from './constants';
import { HouseholdDto } from './households';

export { BACKUP_MAX_BYTES };

/** Version du format de l'archive (`tandem-backup.json`) ; une restauration refuse les autres. */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Invitation créée pour un membre de la sauvegarde dont le compte n'existe pas sur cette
 * instance : en l'acceptant avec son adresse, il reprend son membre et son historique.
 */
export const RestoredInvitationDto = z.object({
  memberId: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  token: z.string(),
  expiresAt: z.string(),
});
export type RestoredInvitationDto = z.infer<typeof RestoredInvitationDto>;

/** Foyer recréé à partir d'une sauvegarde, et ce qui n'a pas été repris. */
export const RestoreResultDto = z.object({
  household: HouseholdDto,
  invitations: z.array(RestoredInvitationDto),
  counts: z.record(z.string(), z.number().int()),
});
export type RestoreResultDto = z.infer<typeof RestoreResultDto>;
