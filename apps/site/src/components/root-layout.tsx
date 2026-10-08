import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/content';
import { Providers } from './providers';
import '../app/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

/** Racine HTML commune aux deux langues (chaque langue a son propre `lang`). */
export function RootLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={locale} className={inter.variable}>
      <body>
        {/* Sans JavaScript, les éléments animés restent à leur état initial (invisibles) : on les
            affiche tels quels. */}
        <noscript>
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
