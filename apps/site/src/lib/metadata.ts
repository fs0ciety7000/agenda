import type { Metadata, Viewport } from 'next';
import { SITE_URL } from './config';
import { content, LANGS, type Locale } from './content';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF6F2' },
    { media: '(prefers-color-scheme: dark)', color: '#141012' },
  ],
};

const OG_LOCALES: Record<Locale, string> = { fr: 'fr_BE', en: 'en_GB', nl: 'nl_BE' };

/** Chemin public d'une langue (`/`, `/en/`, `/nl/`). */
export const localePath = (locale: Locale) => LANGS.find((l) => l.locale === locale)!.href;

/** Image de partage 1200 × 630 d'une langue (générée par `scripts/og-images.mjs`). */
export const ogImage = (locale: Locale) => `/img/og/${locale}.png`;

export function pageMetadata(locale: Locale): Metadata {
  const t = content[locale].meta;
  const path = localePath(locale);
  const image = { url: ogImage(locale), width: 1200, height: 630, alt: t.ogAlt, type: 'image/png' };
  return {
    metadataBase: new URL(SITE_URL),
    title: t.title,
    description: t.description,
    applicationName: 'Tandem',
    category: 'productivity',
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(LANGS.map((l) => [l.locale, l.href])),
        // L'accueil choisit la langue du navigateur (nginx) : c'est la page par défaut.
        'x-default': '/',
      },
    },
    openGraph: {
      type: 'website',
      url: path,
      siteName: 'Tandem',
      title: t.ogTitle,
      description: t.description,
      locale: OG_LOCALES[locale],
      alternateLocale: LANGS.filter((l) => l.locale !== locale).map((l) => OG_LOCALES[l.locale]),
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.ogTitle,
      description: t.description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}
