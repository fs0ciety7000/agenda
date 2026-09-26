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
});
export type MeResponse = z.infer<typeof MeResponse>;

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
