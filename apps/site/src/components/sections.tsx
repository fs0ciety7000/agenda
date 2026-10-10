'use client';

import clsx from 'clsx';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  Download,
  LayoutGrid,
  Lock,
  Megaphone,
  Minus,
  Plus,
  Repeat,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Sun,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { APK_URL, APP_URL, CONTACT_EMAIL, DOCS_URL, PLAY_URL } from '@/lib/config';
import type { Content, FeatureIcon, Locale } from '@/lib/content';
import { OtherLangs } from './nav';
import { EASE, PhoneFrame, Reveal, SectionHeading } from './ui';

const ICONS: Record<FeatureIcon, LucideIcon> = {
  sun: Sun,
  sparkles: Sparkles,
  repeat: Repeat,
  cart: ShoppingCart,
  bell: Bell,
  offline: WifiOff,
  calendar: CalendarDays,
  widget: LayoutGrid,
};

/** Bandeau défilant : où et comment Tandem fonctionne. */
export function Strip({ t }: { t: Content }) {
  const reduce = useReducedMotion();
  const items = [...t.strip, ...t.strip];
  return (
    <div className="relative overflow-hidden border-y border-border bg-surface/60 py-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-linear-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-linear-to-l from-bg to-transparent" />
      <motion.ul
        animate={reduce ? undefined : { x: ['0%', '-50%'] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
        className="flex w-max gap-12 pr-12"
      >
        {items.map((label, i) => (
          <li
            key={`${label}-${i}`}
            aria-hidden={i >= t.strip.length}
            className="flex items-center gap-3 text-lg font-medium whitespace-nowrap text-text-muted"
          >
            <span className="size-1.5 rounded-full bg-accent" />
            {label}
          </li>
        ))}
      </motion.ul>
    </div>
  );
}

export function Features({ t }: { t: Content }) {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <SectionHeading
        eyebrow={t.features.eyebrow}
        title={t.features.title}
        text={t.features.text}
      />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {t.features.items.map((f, i) => {
          const Icon = ICONS[f.icon];
          return (
            <Reveal key={f.title} delay={(i % 4) * 0.08}>
              <motion.article
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="group flex h-full flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-surface p-6 shadow-[0_1px_0_rgb(0_0_0/0.02)] transition-shadow hover:shadow-[0_24px_48px_-24px_rgb(36_24_29/0.3)]"
              >
                <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/10 text-accent transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-text-muted">{f.text}</p>
              </motion.article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function How({ t }: { t: Content }) {
  return (
    <section id="how" className="relative overflow-hidden bg-surface-muted/60 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow={t.how.eyebrow} title={t.how.title} center />
        <ol className="relative mt-16 grid gap-10 md:grid-cols-3">
          <motion.li
            aria-hidden
            role="presentation"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 1.2, ease: EASE, delay: 0.2 }}
            className="absolute top-7 right-[16%] left-[16%] hidden h-px origin-left bg-linear-to-r from-accent/60 via-member-plum/60 to-member-ocean/60 md:block"
          />
          {t.how.steps.map((s, i) => (
            <Reveal
              as="li"
              key={s.title}
              delay={0.15 * i}
              className="relative flex flex-col items-center gap-4 text-center"
            >
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 * i + 0.2 }}
                className="relative z-10 flex size-14 items-center justify-center rounded-full border border-border bg-surface text-lg font-semibold text-accent shadow-lg"
              >
                {i + 1}
              </motion.span>
              <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="max-w-xs leading-relaxed text-text-muted">{s.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

const BAR = { sage: 'bg-member-sage', ocean: 'bg-member-ocean', plum: 'bg-member-plum' } as const;

export function Balance({ t }: { t: Content }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:py-32 lg:grid-cols-2">
      <div className="flex flex-col gap-8">
        <SectionHeading eyebrow={t.balance.eyebrow} title={t.balance.title} text={t.balance.text} />
        <ul className="flex flex-col gap-3">
          {t.balance.points.map((p, i) => (
            <Reveal as="li" key={p} delay={0.1 * i} className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              </span>
              <span className="text-[0.9375rem]">{p}</span>
            </Reveal>
          ))}
        </ul>
      </div>
      <Reveal y={40}>
        <div className="relative rounded-[1.75rem] border border-border bg-surface p-7 shadow-[0_40px_80px_-40px_rgb(36_24_29/0.4)]">
          <p className="mb-6 text-sm font-semibold tracking-wide text-text-muted uppercase">
            {t.balance.card}
          </p>
          <div className="flex flex-col gap-6">
            {t.balance.rows.map((r, i) => (
              <div key={r.name} className="flex items-center gap-4">
                <span
                  className={clsx(
                    'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
                    BAR[r.color],
                  )}
                >
                  {r.name.slice(0, 1)}
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-sm text-text-muted">{r.detail}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${r.value}%` }}
                      viewport={{ once: true, amount: 0.8 }}
                      transition={{ duration: 1.1, ease: EASE, delay: 0.2 + i * 0.15 }}
                      className={clsx('h-full rounded-full', BAR[r.color])}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-text-muted">{t.balance.footnote}</p>
          <motion.span
            animate={{ rotate: [0, 8, 0], y: [0, -6, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-5 -right-5 flex size-14 items-center justify-center rounded-2xl bg-accent text-2xl shadow-xl"
            aria-hidden
          >
            ⚖️
          </motion.span>
        </div>
      </Reveal>
    </section>
  );
}

export function Screens({ t, locale }: { t: Content; locale: Locale }) {
  const ref = useRef<HTMLElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const x = useTransform(scrollYProgress, [0, 1], ['6%', '-22%']);

  return (
    <section ref={ref} className="overflow-hidden bg-surface-muted/60 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow={t.shots.eyebrow} title={t.shots.title} text={t.shots.text} />
      </div>
      <motion.ul
        style={wide ? { x } : undefined}
        className="mt-14 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-6 lg:overflow-visible lg:px-[max(1.25rem,calc((100vw-72rem)/2+1.25rem))]"
      >
        {t.shots.items.map((s, i) => (
          <motion.li
            key={s.file}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.08 * i }}
            className="flex w-[15rem] shrink-0 snap-center flex-col items-center gap-4 sm:w-[16.5rem]"
          >
            <motion.div
              whileHover={{ y: -10, rotate: i % 2 ? 1.5 : -1.5 }}
              transition={{ type: 'spring', stiffness: 250, damping: 20 }}
              className="w-full"
            >
              <PhoneFrame className="pt-7">
                {/* eslint-disable-next-line @next/next/no-img-element -- export statique */}
                <img
                  src={`/shots/${locale === 'fr' ? 'fr' : 'en'}/${s.file}.webp`}
                  alt={s.caption}
                  width={720}
                  height={1440}
                  loading="lazy"
                  className="block aspect-[1/2] w-full object-cover"
                />
              </PhoneFrame>
            </motion.div>
            <span className="text-sm font-medium text-text-muted">{s.caption}</span>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

const PRIVACY_ICONS: LucideIcon[] = [Megaphone, ShieldCheck, Download, Lock];

export function Privacy({ t }: { t: Content }) {
  return (
    <section id="privacy" className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <SectionHeading
            eyebrow={t.privacy.eyebrow}
            title={t.privacy.title}
            text={t.privacy.text}
          />
          <Reveal>
            <a
              href={`${APP_URL}/privacy`}
              className="group inline-flex items-center gap-2 font-semibold text-accent"
            >
              {t.privacy.link}
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </a>
          </Reveal>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {t.privacy.items.map((item, i) => {
            const Icon = PRIVACY_ICONS[i] ?? ShieldCheck;
            return (
              <Reveal key={item.title} delay={0.08 * i}>
                <div className="flex h-full flex-col gap-3 rounded-[var(--radius-xl)] border border-border bg-surface p-6">
                  <Icon className="size-6 text-accent" aria-hidden />
                  <h3 className="font-semibold tracking-tight">{item.title}</h3>
                  <p className="text-[0.9375rem] leading-relaxed text-text-muted">{item.text}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Faq({ t }: { t: Content }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-24 sm:py-32">
      <SectionHeading eyebrow={t.faq.eyebrow} title={t.faq.title} center />
      <ul className="mt-12 flex flex-col gap-3">
        {t.faq.items.map((item, i) => {
          const expanded = open === i;
          return (
            <Reveal
              as="li"
              key={item.q}
              delay={0.05 * i}
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <h3>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpen(expanded ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold"
                >
                  {item.q}
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-accent">
                    {expanded ? (
                      <Minus className="size-4" aria-hidden />
                    ) : (
                      <Plus className="size-4" aria-hidden />
                    )}
                  </span>
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div
                    id={`faq-${i}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: EASE }}
                  >
                    <p className="px-6 pb-6 leading-relaxed text-text-muted">{item.a}</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

export function Cta({ t }: { t: Content }) {
  return (
    <section className="px-5 pb-24">
      <Reveal y={40}>
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-7 overflow-hidden rounded-[2rem] bg-accent px-6 py-20 text-center text-accent-fg sm:px-12">
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
            className="pointer-events-none absolute -top-1/2 left-1/2 size-[60rem] -translate-x-1/2 rounded-full bg-[conic-gradient(from_0deg,transparent,rgb(255_255_255/0.12),transparent_40%)]"
          />
          <motion.img
            src="/img/logo.png"
            alt=""
            width={112}
            height={112}
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative size-28 rounded-[1.75rem] shadow-2xl"
          />
          <h2 className="relative max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
            {t.cta.title}
          </h2>
          <p className="relative max-w-xl text-lg opacity-85">{t.cta.text}</p>
          <div className="relative flex flex-wrap justify-center gap-3">
            <motion.a
              href={`${APP_URL}/register`}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-accent-fg px-6 font-semibold text-accent"
            >
              {t.cta.primary}
              <ArrowRight className="size-4" aria-hidden />
            </motion.a>
            <motion.a
              href={`${APP_URL}/login`}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex h-12 items-center rounded-full border border-current/30 px-6 font-semibold"
            >
              {t.cta.secondary}
            </motion.a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

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
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- export statique */}
            <img
              src="/img/icon-192.png"
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-[10px]"
            />
            <span className="text-lg font-semibold">Tandem</span>
          </div>
          <p className="max-w-xs text-text-muted">{t.footer.tagline}</p>
          <div className="flex gap-4">
            <OtherLangs
              t={t}
              className="text-sm text-text-muted underline underline-offset-4 hover:text-text"
            />
          </div>
        </div>
        {columns.map((c) => (
          <div key={c.title} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{c.title}</h2>
            <ul className="flex flex-col gap-2">
              {c.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[0.9375rem] text-text-muted transition-colors hover:text-text"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 border-t border-border px-5 py-6 text-center text-sm text-text-muted">
        <p>
          © {new Date().getFullYear()} Tandem · {t.footer.rights}
        </p>
        <p>
          <a
            href="https://interactive.cardormedia.com/"
            className="underline underline-offset-4 hover:text-text"
          >
            OCC Interactive
          </a>{' '}
          — {t.footer.division}{' '}
          <a
            href="https://cardormedia.com/marque"
            className="underline underline-offset-4 hover:text-text"
          >
            Cardor Media
          </a>
        </p>
      </div>
    </footer>
  );
}
