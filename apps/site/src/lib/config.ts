/** Adresses publiques, figées au build (variables NEXT_PUBLIC_*, cf. Dockerfile). */
const trim = (url: string) => url.replace(/\/+$/, '');

export const SITE_URL = trim(
  process.env.NEXT_PUBLIC_SITE_URL || 'https://decouvrir.tandem-agenda.app',
);
export const APP_URL = trim(process.env.NEXT_PUBLIC_APP_URL || 'https://tandem-agenda.app');
export const DOCS_URL = trim(process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.tandem-agenda.app');
/** Fiche Google Play, une fois publique. Sinon : APK signé servi par l'app. */
export const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL || null;
export const APK_URL = `${APP_URL}/v1/app/android/tandem.apk`;
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || null;
