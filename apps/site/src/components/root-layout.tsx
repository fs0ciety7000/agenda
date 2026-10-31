import type { ReactNode } from 'react';
import { sans, serif } from '@/lib/font';
import type { Locale } from '@/lib/content';
import '../app/globals.css';

/** Racine HTML commune aux deux langues (chaque langue a son propre `lang`). */
export function RootLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={locale} className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
