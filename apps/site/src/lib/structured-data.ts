import { APK_URL, APP_URL, PLAY_URL, SITE_URL } from './config';
import { content, type Locale } from './content';
import { localePath, ogImage } from './metadata';

/**
 * Données structurées schema.org (JSON-LD) de l'accueil d'une langue : site, éditeur (CM Interactive), app web,
 * app Android et FAQ (les mêmes questions que la section visible « Questions fréquentes »).
 * Rien d'inventé : pas de note ni d'avis tant qu'il n'y en a pas de vérifiables.
 */
export function structuredData(locale: Locale) {
  const t = content[locale];
  const url = `${SITE_URL}${localePath(locale)}`;
  // Éditeur : CM Interactive, studio de CARDOR Media (mêmes @id que sur les autres sites du studio).
  const org = 'https://interactive.cardormedia.com/#organization';
  const free = { '@type': 'Offer', price: '0', priceCurrency: 'EUR' };
  const app = {
    name: 'Tandem',
    description: t.meta.description,
    inLanguage: ['fr', 'en', 'nl'],
    applicationCategory: 'LifestyleApplication',
    applicationSubCategory: 'ProductivityApplication',
    offers: free,
    publisher: { '@id': org },
    image: `${SITE_URL}${ogImage(locale)}`,
  };
  const screenshots = ['1_today', '3_calendar'].map(
    (f) => `${SITE_URL}/shots/${locale === 'fr' ? 'fr' : 'en'}/${f}.webp`,
  );
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: 'CM Interactive',
        url: 'https://interactive.cardormedia.com/',
        parentOrganization: {
          '@type': 'Organization',
          '@id': 'https://cardormedia.com/#organization',
          name: 'CARDOR Media',
          url: 'https://cardormedia.com/',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: 'Tandem',
        inLanguage: locale,
        publisher: { '@id': org },
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: t.meta.title,
        description: t.meta.description,
        inLanguage: locale,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${APP_URL}/#webapp` },
        primaryImageOfPage: `${SITE_URL}${ogImage(locale)}`,
      },
      {
        '@type': 'WebApplication',
        '@id': `${APP_URL}/#webapp`,
        ...app,
        url: `${APP_URL}/`,
        operatingSystem: 'Web',
        browserRequirements: 'Requires JavaScript. Requires HTML5.',
      },
      {
        '@type': 'MobileApplication',
        '@id': `${SITE_URL}/#android`,
        ...app,
        operatingSystem: 'Android',
        ...(PLAY_URL ? { url: PLAY_URL, installUrl: PLAY_URL } : { downloadUrl: APK_URL }),
        screenshot: screenshots,
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        inLanguage: locale,
        mainEntity: t.faq.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };
}

/** Sérialisation sûre dans un <script> (pas de « </script> » possible dans le texte). */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
