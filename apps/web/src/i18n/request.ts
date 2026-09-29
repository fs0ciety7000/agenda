import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type AppLocale } from './locale';

export { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, type AppLocale } from './locale';

/** Langue : cookie du sélecteur, sinon langues du navigateur. Pas de préfixe d'URL. */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = isLocale(fromCookie)
    ? fromCookie
    : localeFromAcceptLanguage((await headers()).get('accept-language'));
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'Europe/Brussels',
  };
});
