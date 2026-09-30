export const LOCALES = ['fr', 'en', 'nl'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'fr';
/** Cookie posé par le sélecteur de langue (prioritaire sur le navigateur). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const isLocale = (v: string | undefined): v is AppLocale => LOCALES.includes(v as AppLocale);

/**
 * Langue d'après l'en-tête Accept-Language : la première langue prise en charge, par ordre de
 * préférence (q). Un navigateur qui ne demande ni français, ni anglais, ni néerlandais (allemand…)
 * reçoit l'anglais ; sans en-tête (robots), le français.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): AppLocale {
  if (!header?.trim()) return DEFAULT_LOCALE;
  const langs = header
    .split(',')
    .map((part, i) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { lang: tag.trim().slice(0, 2).toLowerCase(), q: q ? Number(q.slice(2)) : 1, i };
    })
    .filter((l) => l.lang && l.lang !== '*' && l.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  const match = langs.find((l) => isLocale(l.lang));
  if (match) return match.lang as AppLocale;
  return langs.length ? 'en' : DEFAULT_LOCALE;
}
