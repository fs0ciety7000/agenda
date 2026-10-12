import { content, type Locale } from '@/lib/content';
import { jsonLd, structuredData } from '@/lib/structured-data';
import { Film } from './film';
import { Hero } from './hero';
import { Nav } from './nav';
import { Balance, Cta, Faq, Features, Footer, How, Privacy, Screens, Strip } from './sections';

/** Page d'accueil du site vitrine (une par langue). */
export function Landing({ locale }: { locale: Locale }) {
  const t = content[locale];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData(locale)) }}
      />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        {{ fr: 'Aller au contenu', en: 'Skip to content', nl: 'Naar de inhoud' }[locale]}
      </a>
      <Nav t={t} />
      <main id="main">
        <Hero t={t} />
        <Strip t={t} />
        <Film t={t} />
        <Features t={t} />
        <How t={t} />
        <Balance t={t} />
        <Screens t={t} locale={locale} />
        <Privacy t={t} />
        <Faq t={t} />
        <Cta t={t} />
      </main>
      <Footer t={t} />
    </>
  );
}
