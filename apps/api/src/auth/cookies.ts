import type { CookieOptions, Response } from 'express';
import { env } from '../config/env';

export const ACCESS_COOKIE = 'gn_at';
export const REFRESH_COOKIE = 'gn_rt';
/** Le refresh token n'est envoyé qu'aux routes d'auth. */
const REFRESH_PATH = '/v1/auth';

const base = (): CookieOptions => ({
  httpOnly: true,
  secure: env().COOKIE_SECURE,
  sameSite: 'lax',
});

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base(),
    path: '/',
    maxAge: env().ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base(),
    path: REFRESH_PATH,
    maxAge: env().REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(), path: REFRESH_PATH });
}
