import type { ReactNode } from 'react';
import { sans } from '@/lib/font';
import type { Locale } from '@/lib/content';
import { Providers } from './providers';
import '../app/globals.css';

/** Racine HTML commune aux deux langues (chaque langue a son propre `lang`). */
export function RootLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={locale} className={sans.variable}>
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
