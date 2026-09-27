import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('about');
  return {
    title: t('metaTitle'),
    description: t('tagline'),
    robots: { index: true, follow: true },
  };
}

function Paragraphs({ text, list = false }: { text: string; list?: boolean }) {
  const lines = text.split('\n');
  if (list)
    return (
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    );
  return (
    <div className="mt-2 space-y-3 text-[0.9375rem] leading-relaxed">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

/**
 * Page d'accueil publique (sans connexion) : exigée par Google pour la vérification de l'écran
 * de consentement OAuth (description de l'app, usage des données Google, lien vers la politique).
 */
export default async function AboutPage() {
  const t = await getTranslations('about');
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <Image src="/icons/icon-192.png" alt="" width={72} height={72} priority className="mb-6" />
      <h1 className="text-3xl font-semibold tracking-tight">Agenda G & N</h1>
      <p className="mt-2 text-lg text-text-muted">{t('tagline')}</p>
      <p className="mt-6 text-[0.9375rem] leading-relaxed">{t('intro')}</p>

      <section className="mt-8" aria-labelledby="a-features">
        <h2 id="a-features" className="text-lg font-semibold">
          {t('featuresTitle')}
        </h2>
        <Paragraphs text={t('features')} list />
      </section>

      <section className="mt-8" aria-labelledby="a-google">
        <h2 id="a-google" className="text-lg font-semibold">
          {t('googleTitle')}
        </h2>
        <Paragraphs text={t('google')} />
      </section>

      <nav
        className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem]"
        aria-label="Agenda G & N"
      >
        <Link href="/privacy" className="text-accent underline underline-offset-4">
          {t('privacyLink')}
        </Link>
        <Link href="/login" className="text-accent underline underline-offset-4">
          {t('login')}
        </Link>
      </nav>
      <p className="mt-10 text-[0.8125rem] text-text-muted">{t('footer')}</p>
    </main>
  );
}
