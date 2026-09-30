import { z } from 'zod';
import { Locale } from './enums';

export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** OWASP : longueur minimale, pas de règles de composition arbitraires. */
export const Password = z.string().min(10).max(128);

export const RegisterInput = z.object({
  email: Email,
  password: Password,
  displayName: z.string().trim().min(1).max(60),
  locale: Locale.default('fr'),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: Email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginInput>;

/** Clients mobiles : le refresh token circule dans le corps (le web utilise un cookie httpOnly). */
export const RefreshInput = z.object({
  refreshToken: z.string().min(20).max(200).optional(),
});
export type RefreshInput = z.infer<typeof RefreshInput>;

export const MeResponse = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  locale: Locale,
  /** Faux pour un compte créé via Google uniquement. */
  hasPassword: z.boolean(),
  googleLinked: z.boolean(),
  /** Accès à l'administration (ADMIN_EMAILS). */
  isAdmin: z.boolean().optional(),
});
export type MeResponse = z.infer<typeof MeResponse>;

/** Préférences du compte : langue de l'interface et des e-mails. */
export const UpdateMeInput = z.object({ locale: Locale });
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;

export const AuthResponse = z.object({
  user: MeResponse,
  /** Présents uniquement pour les clients `X-Client: mobile`. */
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  accessTokenExpiresIn: z.number().int(),
});
export type AuthResponse = z.infer<typeof AuthResponse>;

export const ForgotPasswordInput = z.object({ email: Email });
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInput>;

export const ResetPasswordInput = z.object({
  token: z.string().min(20).max(200),
  password: Password,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;

/** `currentPassword` obligatoire si le compte a déjà un mot de passe (compte Google seul : non). */
export const ChangePasswordInput = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: Password,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

export const AuthProvidersDto = z.object({
  google: z.boolean(),
  registration: z.boolean(),
  passwordReset: z.boolean(),
});
export type AuthProvidersDto = z.infer<typeof AuthProvidersDto>;

/** Suppression du compte : mot de passe (comptes avec mot de passe) ou confirmation explicite. */
export const DeleteAccountInput = z.object({
  password: z.string().max(128).optional(),
  confirm: z.literal('SUPPRIMER').or(z.literal('DELETE')).optional(),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountInput>;

/** App Android : échange du code reçu après « Continuer avec Google » (PKCE app ↔ API). */
export const MobileExchangeInput = z.object({
  code: z.string().min(20).max(200),
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
});
export type MobileExchangeInput = z.infer<typeof MobileExchangeInput>;

/** Adresse de retour vers l'app Android (schéma propre à l'app, cf. AndroidManifest). */
export const ANDROID_AUTH_REDIRECT = 'app.tandem.foyer://auth';

/** Passkeys (WebAuthn) : connexion sans mot de passe (empreinte, visage, code du téléphone). */
export const PasskeyDto = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  /** Synchronisée entre appareils (trousseau iCloud, gestionnaire Google…). */
  synced: z.boolean(),
});
export type PasskeyDto = z.infer<typeof PasskeyDto>;

/** Options WebAuthn à passer au navigateur, et l'identifiant du défi à renvoyer. */
export const PasskeyOptionsDto = z.object({
  challengeId: z.uuid(),
  options: z.record(z.string(), z.unknown()),
});
export type PasskeyOptionsDto = z.infer<typeof PasskeyOptionsDto>;

export const PasskeyRegisterInput = z.object({
  challengeId: z.uuid(),
  response: z.record(z.string(), z.unknown()),
  name: z.string().trim().min(1).max(60).optional(),
});
export type PasskeyRegisterInput = z.infer<typeof PasskeyRegisterInput>;

export const PasskeyLoginInput = z.object({
  challengeId: z.uuid(),
  response: z.record(z.string(), z.unknown()),
});
export type PasskeyLoginInput = z.infer<typeof PasskeyLoginInput>;

export const RenamePasskeyInput = z.object({ name: z.string().trim().min(1).max(60) });
export type RenamePasskeyInput = z.infer<typeof RenamePasskeyInput>;
