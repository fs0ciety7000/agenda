import type { Metadata, Viewport } from 'next';
import { SITE_URL } from './config';
import { content, LANGS, type Locale } from './content';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF6F2' },
    { media: '(prefers-color-scheme: dark)', color: '#141012' },
  ],
};

export function pageMetadata(locale: Locale): Metadata {
  const t = content[locale].meta;
  const path = LANGS.find((l) => l.locale === locale)!.href;
  // Pas de visuel néerlandais dédié : celui en anglais.
  const og = `/img/og-${locale === 'fr' ? 'fr' : 'en'}.png`;
  return {
    metadataBase: new URL(SITE_URL),
    title: t.title,
    description: t.description,
    alternates: {
      canonical: path,
      languages: Object.fromEntries(LANGS.map((l) => [l.locale, l.href])),
    },
    openGraph: {
      type: 'website',
      url: path,
      siteName: 'Tandem',
      title: t.title,
      description: t.description,
      locale: { fr: 'fr_BE', en: 'en_GB', nl: 'nl_BE' }[locale],
      images: [{ url: og, width: 1024, height: 500, alt: 'Tandem' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.description,
      images: [og],
    },
  };
}
