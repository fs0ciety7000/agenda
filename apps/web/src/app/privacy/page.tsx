import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

// Lu à l'exécution (variable du conteneur web) : pas besoin de reconstruire l'image.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacyPolicy');
  return { title: `${t('title')} · Agenda G & N`, robots: { index: true, follow: false } };
}

const SECTIONS = [
  'who',
  'data',
  'google',
  'use',
  'processors',
  'retention',
  'security',
  'rights',
  'cookies',
] as const;

/** Politique de confidentialité (publique : exigée par Google pour l'accès au calendrier). */
export default async function PrivacyPage() {
  const t = await getTranslations('privacyPolicy');
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <p className="mb-6 text-sm">
        <Link href="/" className="text-accent underline-offset-4 hover:underline">
          ← Agenda G & N
        </Link>
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-sm text-text-muted">{t('updated')}</p>
      <p className="mt-6 text-[0.9375rem] leading-relaxed">{t('intro')}</p>
      {SECTIONS.map((key) => (
        <section key={key} className="mt-8" aria-labelledby={`p-${key}`}>
          <h2 id={`p-${key}`} className="text-lg font-semibold">
            {t(`${key}.title`)}
          </h2>
          <div className="mt-2 space-y-3 text-[0.9375rem] leading-relaxed text-text">
            {t(`${key}.body`)
              .split('\n')
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
        </section>
      ))}
      <section className="mt-8" aria-labelledby="p-contact">
        <h2 id="p-contact" className="text-lg font-semibold">
          {t('contact.title')}
        </h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed">
          {contact ? (
            <>
              {t('contact.body')}{' '}
              <a href={`mailto:${contact}`} className="text-accent underline underline-offset-4">
                {contact}
              </a>
            </>
          ) : (
            t('contact.fallback')
          )}
        </p>
      </section>
    </main>
  );
}
