import { z } from 'zod';
import { Email } from './auth';
import { HouseholdRole } from './enums';

export const MemberColor = z.enum(['sage', 'ocean', 'amber', 'plum', 'clay', 'slate']);
export type MemberColor = z.infer<typeof MemberColor>;

const IanaTimezone = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid IANA time zone');

export const CreateHouseholdInput = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: IanaTimezone.default('Europe/Brussels'),
  /** Nom affiché du créateur dans ce foyer (ex. « Nicolas »). */
  memberDisplayName: z.string().trim().min(1).max(40).optional(),
});
export type CreateHouseholdInput = z.infer<typeof CreateHouseholdInput>;

export const CreateInvitationInput = z.object({
  email: Email.optional(),
});
export type CreateInvitationInput = z.infer<typeof CreateInvitationInput>;

export const AcceptInvitationInput = z.object({
  token: z.string().min(20).max(200),
  memberDisplayName: z.string().trim().min(1).max(40).optional(),
});
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationInput>;

export const HouseholdMemberDto = z.object({
  id: z.uuid(),
  /** null = ancien membre dont le compte a été supprimé. */
  userId: z.uuid().nullable(),
  displayName: z.string(),
  role: HouseholdRole,
  color: MemberColor,
  /** Mode absence en cours : dernier jour d'absence (inclus), sinon null. */
  absentUntil: z.string().nullish(),
  /** Foyer restauré : membre qui n'a pas encore rejoint cette instance (invitation envoyée). */
  pending: z.boolean().optional(),
});
export type HouseholdMemberDto = z.infer<typeof HouseholdMemberDto>;

export const HouseholdDto = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
  members: z.array(HouseholdMemberDto),
});
export type HouseholdDto = z.infer<typeof HouseholdDto>;

export const CategoryDto = z.object({
  id: z.uuid(),
  name: z.string(),
  emoji: z.string().nullable(),
  position: z.number().int(),
});
export type CategoryDto = z.infer<typeof CategoryDto>;

/**
 * Catégories créées avec chaque foyer. `key` sert à la traduction côté client
 * tant que l'utilisateur n'a pas renommé la catégorie.
 */
export const DEFAULT_CATEGORIES = [
  { key: 'home', emoji: '🏠', fr: 'Maison', en: 'Home', nl: 'Huis' },
  { key: 'cleaning', emoji: '🧹', fr: 'Ménage', en: 'Cleaning', nl: 'Poetsen' },
  { key: 'cooking', emoji: '🍳', fr: 'Cuisine', en: 'Cooking', nl: 'Koken' },
  { key: 'groceries', emoji: '🛒', fr: 'Courses', en: 'Groceries', nl: 'Boodschappen' },
  { key: 'laundry', emoji: '🧺', fr: 'Lessive', en: 'Laundry', nl: 'Was' },
  { key: 'pets', emoji: '🐾', fr: 'Animaux', en: 'Pets', nl: 'Huisdieren' },
  { key: 'admin', emoji: '💰', fr: 'Administratif', en: 'Paperwork', nl: 'Administratie' },
  { key: 'car', emoji: '🚗', fr: 'Voiture', en: 'Car', nl: 'Auto' },
  { key: 'maintenance', emoji: '🔧', fr: 'Entretien', en: 'Maintenance', nl: 'Onderhoud' },
  { key: 'outdoor', emoji: '🌱', fr: 'Extérieur', en: 'Outdoor', nl: 'Buiten' },
  { key: 'personal', emoji: '👤', fr: 'Personnel', en: 'Personal', nl: 'Persoonlijk' },
  { key: 'couple', emoji: '❤️', fr: 'Couple', en: 'Couple', nl: 'Koppel' },
  { key: 'misc', emoji: '📦', fr: 'Divers', en: 'Misc', nl: 'Allerlei' },
] as const;
