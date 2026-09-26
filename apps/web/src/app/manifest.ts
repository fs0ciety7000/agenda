import type { MetadataRoute } from 'next';

/** « Ajouter à l'écran d'accueil » (Chrome Android, iOS) : icônes générées par scripts/generate-icons.py. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Agenda G & N',
    short_name: 'Agenda G&N',
    start_url: '/',
    display: 'standalone',
    background_color: '#FBFAF8',
    theme_color: '#FBFAF8',
    lang: 'fr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
