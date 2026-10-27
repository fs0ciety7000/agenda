import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('help');
  return {
    title: `${t('title')} · Tandem`,
    description: t('intro'),
    alternates: { canonical: '/help' },
  };
}

const ITEMS = [
  'invite',
  'notSeen',
  'passkey',
  'passkeyRefused',
  'barcode',
  'offline',
  'notifications',
  'deleted',
  'data',
] as const;

/**
 * Questions fréquentes, dans les trois langues (publique : utile avant la connexion, et ouverte
 * depuis l'app Android). Le guide complet reste sur le site de documentation.
 */
export default async function HelpPage() {
  const t = await getTranslations('help');
  const docs = process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.tandem-agenda.app';
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <p className="mb-6 text-sm">
        <Link href="/" className="text-accent underline-offset-4 hover:underline">
          ← Tandem
        </Link>
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-[0.9375rem] text-text-muted">{t('intro')}</p>
      {ITEMS.map((key) => (
        <section key={key} className="mt-8" aria-labelledby={`h-${key}`}>
          <h2 id={`h-${key}`} className="text-lg font-semibold">
            {t(`items.${key}.q`)}
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed">{t(`items.${key}.a`)}</p>
        </section>
      ))}
      <section className="mt-10 border-t border-border pt-6" aria-labelledby="h-more">
        <h2 id="h-more" className="text-lg font-semibold">
          {t('more')}
        </h2>
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[0.9375rem]">
          <Link href="/report?from=/help" className="text-accent underline underline-offset-4">
            {t('report')}
          </Link>
          <a href={docs} className="text-accent underline underline-offset-4">
            {t('guide')}
          </a>
          <Link href="/status" className="text-accent underline underline-offset-4">
            {t('status')}
          </Link>
        </p>
      </section>
    </main>
  );
}
