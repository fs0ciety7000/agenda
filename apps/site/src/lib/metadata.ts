import type { Metadata, Viewport } from 'next';
import { SITE_URL } from './config';
import { content, type Locale } from './content';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF6F2' },
    { media: '(prefers-color-scheme: dark)', color: '#141012' },
  ],
};

export function pageMetadata(locale: Locale): Metadata {
  const t = content[locale].meta;
  const path = locale === 'fr' ? '/' : '/en/';
  return {
    metadataBase: new URL(SITE_URL),
    title: t.title,
    description: t.description,
    alternates: { canonical: path, languages: { fr: '/', en: '/en/' } },
    openGraph: {
      type: 'website',
      url: path,
      siteName: 'Tandem',
      title: t.title,
      description: t.description,
      locale: locale === 'fr' ? 'fr_BE' : 'en_GB',
      images: [{ url: `/img/og-${locale}.png`, width: 1024, height: 500, alt: 'Tandem' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.description,
      images: [`/img/og-${locale}.png`],
    },
  };
}
