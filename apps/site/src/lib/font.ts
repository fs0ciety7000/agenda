import localFont from 'next/font/local';

// Police du design system « Duo » (comme l'app web) : Instrument Sans 400, 500, 600, servie
// depuis le dépôt (latin étendu, licence OFL dans src/fonts).
export const sans = localFont({
  src: [
    { path: '../fonts/instrument-sans-regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/instrument-sans-medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/instrument-sans-semibold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-instrument',
  display: 'swap',
});
