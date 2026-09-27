import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Bell, Repeat, ShoppingCart, Sparkles, Sun, WifiOff } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('about');
  return {
    title: t('metaTitle'),
    description: t('tagline'),
    robots: { index: true, follow: true },
  };
}

/** Une icône par ligne de `about.features`, dans le même ordre. */
const FEATURE_ICONS = [Sun, Sparkles, Repeat, ShoppingCart, Bell, WifiOff];

/**
 * Page d'accueil publique (sans connexion) : exigée par Google pour la vérification de l'écran
 * de consentement OAuth (description de l'app, usage des données Google, lien vers la politique).
 */
export default async function AboutPage() {
  const t = await getTranslations('about');
  const features = t('features').split('\n');
  return (
    <main id="main" className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-12 sm:py-16">
      <header className="flex flex-col items-start gap-5">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={80}
          height={80}
          priority
          className="rounded-2xl shadow-[0_4px_16px_rgb(0_0_0/0.08)]"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold tracking-tight">Agenda G & N</h1>
          <p className="text-xl text-text-muted">{t('tagline')}</p>
        </div>
        <p className="max-w-2xl text-[0.9375rem] leading-relaxed">{t('intro')}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-[0.9375rem] font-medium text-accent-fg hover:opacity-90"
          >
            {t('cta')}
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center rounded-md border border-border bg-surface px-5 text-[0.9375rem] font-medium hover:bg-surface-muted"
          >
            {t('ctaSecondary')}
          </Link>
        </div>
      </header>

      <section aria-labelledby="a-features" className="flex flex-col gap-4">
        <h2 id="a-features" className="text-lg font-semibold">
          {t('featuresTitle')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {features.map((line, i) => {
            const Icon = FEATURE_ICONS[i] ?? Sparkles;
            return (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4 text-[0.9375rem] leading-relaxed"
              >
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"
                >
                  <Icon className="size-[1.125rem]" />
                </span>
                {line}
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="a-google"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="a-google" className="text-lg font-semibold">
          {t('googleTitle')}
        </h2>
        <div className="space-y-3 text-[0.9375rem] leading-relaxed">
          {t('google')
            .split('\n')
            .map((l, i) => (
              <p key={i}>{l}</p>
            ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-[0.8125rem] text-text-muted">
        <span>{t('footer')}</span>
        <Link href="/privacy" className="text-accent underline underline-offset-4">
          {t('privacyLink')}
        </Link>
      </footer>
    </main>
  );
}
