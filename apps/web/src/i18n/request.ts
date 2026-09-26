import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const LOCALES = ['fr', 'en'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'fr';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

const isLocale = (v: string | undefined): v is AppLocale => LOCALES.includes(v as AppLocale);

/** Langue : cookie explicite, sinon Accept-Language, sinon français. Pas de préfixe d'URL. */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const fromHeader = (await headers()).get('accept-language')?.slice(0, 2);
  const locale: AppLocale = isLocale(fromCookie)
    ? fromCookie
    : isLocale(fromHeader)
      ? fromHeader
      : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'Europe/Brussels',
  };
});
