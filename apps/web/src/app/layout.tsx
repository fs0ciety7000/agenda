import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ErrorListener } from '@/components/app/error-listener';
import { themeInitScript } from '@/lib/theme';
import { Providers } from './providers';
import './globals.css';

// Police unique de l'app (design system « Duo ») : 400, 500, 600. Fichiers dans le dépôt
// (latin étendu, licence OFL dans src/fonts) : le build ne dépend pas de Google Fonts.
const sans = localFont({
  src: [
    { path: '../fonts/instrument-sans-regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/instrument-sans-medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/instrument-sans-semibold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-instrument',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    // Base des URL relatives (canonical des pages publiques).
    metadataBase: new URL('https://tandem-agenda.app'),
    title: 'Tandem',
    description: t('tagline'),
    applicationName: 'Tandem',
    robots: { index: false, follow: false },
  };
}
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1012' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations('app');
  return (
    <html lang={locale} className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>
          <Providers>
            <ErrorListener />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
