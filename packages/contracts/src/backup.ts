import { z } from 'zod';
import { BACKUP_MAX_BYTES, BACKUP_PASSPHRASE_MIN } from './constants';
import { HouseholdDto } from './households';
import { RevealNoteInput } from './notes';

export { BACKUP_MAX_BYTES, BACKUP_PASSPHRASE_MIN };

/** Version du format de l'archive (`tandem-backup.json`) ; une restauration refuse les autres. */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Télécharger la sauvegarde : vérification comme pour les notes sensibles, et phrase de passe
 * facultative qui chiffre l'archive (AES-256-GCM, clé tirée par scrypt). Sans elle, impossible
 * de la restaurer : elle n'est gardée nulle part.
 */
export const BackupDownloadInput = RevealNoteInput.extend({
  passphrase: z.string().min(BACKUP_PASSPHRASE_MIN).max(200).optional(),
});
export type BackupDownloadInput = z.infer<typeof BackupDownloadInput>;

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
