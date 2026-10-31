import localFont from 'next/font/local';

// Polices de l'identité « Deux fils » (comme l'app web), servies depuis le dépôt (latin étendu,
// licence OFL dans src/fonts) : Instrument Sans pour le texte, Instrument Serif pour les titres.
export const sans = localFont({
  src: [
    { path: '../fonts/instrument-sans-regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/instrument-sans-medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/instrument-sans-semibold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-instrument',
  display: 'swap',
});

export const serif = localFont({
  src: [
    { path: '../fonts/instrument-serif-regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/instrument-serif-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});
