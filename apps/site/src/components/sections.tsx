import { ArrowRight } from 'lucide-react';
import { APK_URL, APP_URL, CONTACT_EMAIL, DOCS_URL, PLAY_URL } from '@/lib/config';
import type { Content, Locale } from '@/lib/content';
import { Gravure } from './gravure';
import { OtherLangs } from './nav';
import { PublisherCredit } from './publisher-credit';
import { ButtonLink, Logo, PhoneFrame, Reveal } from './ui';

/** Le fil : deux lignes (cobalt, abricot) qui se dessinent sous l'ouverture. */
export function Threads() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 160"
      preserveAspectRatio="none"
      className="block h-28 w-full sm:h-40"
    >
      <path
        d="M-20 120C200 20 360 150 560 80S900 10 1060 90S1320 140 1460 40"
        fill="none"
        stroke="var(--gn-brand-cobalt)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="draw"
      />
      <path
        d="M-20 90C220 150 380 30 580 100S920 150 1080 60S1340 20 1460 110"
        fill="none"
        stroke="var(--gn-brand-apricot)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="draw"
        style={{ animationDelay: '300ms', animationDuration: '3.2s' }}
      />
    </svg>
  );
}

/** Nuit : les fonctions, numérotées, à côté du téléphone. */
export function Features({ t, locale }: { t: Content; locale: Locale }) {
  return (
    <section
      id="features"
      className="night rounded-t-[3rem] bg-brand-night px-5 py-24 text-brand-paper sm:py-32"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-16">
        <div className="flex flex-[0_1_20rem] justify-center lg:sticky lg:top-24">
          <PhoneFrame className="w-[17rem] rotate-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- export statique */}
            <img
              src={`/shots/${locale}/2_shopping.webp`}
              alt=""
              width={720}
              height={1440}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </PhoneFrame>
        </div>
        <div className="flex min-w-0 flex-[1_1_32rem] flex-col">
          <Reveal className="mb-8 flex flex-col gap-3">
            <span className="text-sm font-medium text-brand-mist">{t.features.eyebrow}</span>
            <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-none tracking-[-0.03em]">
              {t.features.title}
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-brand-mist">{t.features.text}</p>
          </Reveal>
          <ol>
            {t.features.items.map((f, i) => (
              <Reveal
                as="li"
                key={f.title}
                className="feature flex items-baseline gap-6 rounded-2xl border-t border-brand-paper/15 py-6"
              >
                <span className="w-10 flex-none font-display text-[1.625rem] text-brand-lilac tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex flex-col gap-1.5">
                  <h3 className="text-[1.375rem] font-semibold">{f.title}</h3>
                  <span className="leading-relaxed text-brand-mist">{f.text}</span>
                </span>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** Trois chiffres vrais, en grand serif. */
export function Numbers({ t }: { t: Content }) {
  return (
    <section className="night bg-brand-night px-5 pb-24 text-brand-paper sm:pb-32">
      <ul className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-3">
        {t.numbers.map((n, i) => (
          <Reveal
            as="li"
            key={n.text}
            className="flex flex-col gap-2 rounded-[2rem] border border-brand-paper/15 p-9"
          >
            <span className="font-display text-[7.5rem] leading-[0.9] tracking-[-0.04em]">
              {n.value}
              <span
                className={`text-[2.5rem] italic ${i === 1 ? 'text-brand-apricot' : 'text-brand-lilac'}`}
              >
                {' '}
                {n.unit}
              </span>
            </span>
            <span className="text-lg text-brand-mist">{n.text}</span>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export function Privacy({ t }: { t: Content }) {
  return (
    <section id="privacy" className="px-5 py-24 sm:py-32">
      <div className="mx-auto flex max-w-6xl flex-col gap-12">
        <Reveal className="flex max-w-4xl flex-col gap-4">
          <span className="text-sm font-medium text-text-muted">{t.privacy.eyebrow}</span>
          <h2 className="font-display text-[clamp(2.5rem,5.5vw,5rem)] leading-none tracking-[-0.03em]">
            {t.privacy.title}
          </h2>
          <p className="max-w-2xl text-lg leading-relaxed text-text-muted">{t.privacy.text}</p>
        </Reveal>
        <ul className="grid gap-8 border-t border-border pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {t.privacy.items.map((item) => (
            <Reveal as="li" key={item.title} className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="leading-relaxed text-text-muted">{item.text}</p>
            </Reveal>
          ))}
        </ul>
        <a
          href={`${APP_URL}/privacy`}
          className="group inline-flex w-fit items-center gap-2 font-semibold text-accent"
        >
          {t.privacy.link}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </a>
      </div>
    </section>
  );
}

/** Questions : `<details>` natif (clavier, lecteurs d'écran, sans JavaScript), réponses dans le HTML. */
export function Faq({ t }: { t: Content }) {
  return (
    <section id="faq" className="px-5 pb-24 sm:pb-32">
      <div className="mx-auto flex max-w-3xl flex-col">
        <h2 className="mb-6 font-display text-[clamp(2.25rem,4vw,3.5rem)] tracking-[-0.02em]">
          {t.faq.title}
        </h2>
        {t.faq.items.map((item, i) => (
          <details
            key={item.q}
            open={i === 0}
            className="faq border-t border-border py-5 last:border-b"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
              {item.q}
              <span
                aria-hidden
                className="faq-sign flex size-8 flex-none items-center justify-center rounded-full bg-surface-muted text-accent"
              >
                +
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Pied de page : appel final, liens, puis la gravure de nuit. */
export function Footer({ t }: { t: Content }) {
  const l = t.footer.links;
  const columns = [
    {
      title: t.footer.product,
      links: [
        { label: l.app, href: `${APP_URL}/login` },
        { label: l.android, href: PLAY_URL ?? APK_URL },
        { label: l.status, href: `${APP_URL}/status` },
      ],
    },
    {
      title: t.footer.help,
      links: [
        { label: l.docs, href: DOCS_URL },
        { label: l.faq, href: `${DOCS_URL}/guide/faq` },
        { label: l.report, href: `${APP_URL}/report` },
      ],
    },
    {
      title: t.footer.legal,
      links: [
        { label: l.privacy, href: `${APP_URL}/privacy` },
        ...(CONTACT_EMAIL ? [{ label: l.contact, href: `mailto:${CONTACT_EMAIL}` }] : []),
      ],
    },
  ];
  return (
    <footer className="night overflow-hidden bg-brand-night text-brand-paper">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 pt-24 pb-14 text-center sm:pt-28">
        <h2 className="font-display text-[clamp(3rem,7vw,6.5rem)] leading-[0.95] tracking-[-0.035em]">
          {t.cta.title[0]} <span className="text-brand-apricot italic">{t.cta.title[1]}</span>
        </h2>
        <p className="max-w-xl text-lg text-brand-mist">{t.cta.text}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink
            href={`${APP_URL}/register`}
            variant="apricot"
            className="min-h-14 px-7 text-base"
          >
            {t.cta.primary}
          </ButtonLink>
          <ButtonLink
            href={`${APP_URL}/login`}
            variant="secondary"
            className="min-h-14 px-7 text-base"
          >
            {t.cta.secondary}
          </ButtonLink>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-12 border-t border-brand-paper/15 px-5 pt-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-4">
          <Logo tone="night" className="text-[2.25rem]" />
          <p className="max-w-xs text-brand-mist">{t.footer.tagline}</p>
        </div>
        {columns.map((c) => (
          <div key={c.title} className="flex flex-col gap-3">
            <h2 className="font-display text-[1.375rem] italic">{c.title}</h2>
            <ul className="flex flex-col gap-1">
              {c.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="footer-link inline-flex min-h-8 items-center text-[0.9375rem]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-[1.375rem] italic">{t.lang.label}</h2>
          <div className="flex flex-col items-start gap-1">
            <OtherLangs
              t={t}
              className="footer-link inline-flex min-h-8 items-center text-[0.9375rem]"
            />
          </div>
        </div>
      </div>

      <Gravure label={t.footer.gravure} />
      <div className="border-t border-brand-paper/15">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-5 py-5 text-center text-[0.8125rem] text-brand-mist sm:flex-row sm:justify-between sm:text-left">
          <p>
            © {new Date().getFullYear()} Tandem · {t.footer.rights}
          </p>
          <PublisherCredit t={t} />
        </div>
      </div>
    </footer>
  );
}
