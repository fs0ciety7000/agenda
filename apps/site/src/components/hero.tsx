'use client';

import clsx from 'clsx';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ListChecks,
  Settings,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Sun,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { APK_URL, APP_URL, PLAY_URL } from '@/lib/config';
import type { Content } from '@/lib/content';
import { ButtonLink, EASE, PhoneFrame } from './ui';

const WHO = { n: 'bg-member-sage', g: 'bg-member-ocean', both: 'bg-member-plum' } as const;

export function Hero({ t }: { t: Content }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const blobY = useTransform(scrollYProgress, [0, 1], [0, -120]);

  const line = {
    hidden: { opacity: 0, y: 28, filter: 'blur(6px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
  };

  return (
    <section
      ref={ref}
      id="top"
      className="relative isolate overflow-hidden pt-28 pb-20 sm:pt-36 lg:pb-28"
    >
      {/* Halo d'ambiance : couleurs de l'app, en mouvement lent. */}
      <motion.div
        aria-hidden
        style={{ y: blobY }}
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 left-[-10%] size-[36rem] rounded-full bg-accent/20 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-20 right-[-15%] size-[32rem] rounded-full bg-member-ocean/15 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[-20%] left-1/3 size-[28rem] rounded-full bg-member-sage/15 blur-3xl"
        />
      </motion.div>

      <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 lg:grid-cols-[1.05fr_0.95fr]">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } } }}
          className="flex flex-col items-start gap-7"
        >
          <motion.span
            variants={line}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3.5 py-1.5 text-sm text-text-muted backdrop-blur"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
            {t.hero.badge}
          </motion.span>
          <h1 className="text-balance text-[2.75rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-[3.75rem] xl:text-[4.1rem]">
            <motion.span variants={line} className="block">
              {t.hero.title[0]}
            </motion.span>
            <motion.span
              variants={line}
              className="block bg-linear-to-r from-accent via-member-plum to-member-ocean bg-clip-text pb-2 text-transparent"
            >
              {t.hero.title[1]}
            </motion.span>
          </h1>
          <motion.p
            variants={line}
            className="max-w-xl text-lg leading-relaxed text-text-muted sm:text-xl"
          >
            {t.hero.text}
          </motion.p>
          <motion.div variants={line} className="flex flex-wrap gap-3">
            <ButtonLink href={`${APP_URL}/register`}>
              {t.hero.primary}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href={PLAY_URL ?? APK_URL} variant="secondary">
              <Smartphone className="size-4" aria-hidden />
              {t.hero.android}
            </ButtonLink>
          </motion.div>
          <motion.p variants={line} className="text-sm text-text-muted">
            {t.hero.note}
          </motion.p>
        </motion.div>

        <motion.div
          style={{ y: phoneY }}
          initial={{ opacity: 0, y: 60, rotate: 4 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.3 }}
          className="relative mx-auto w-full max-w-[21rem]"
        >
          <PhoneMock t={t} />
        </motion.div>
      </div>
    </section>
  );
}

/** Écran « Aujourd'hui » simulé : des tâches se cochent, une tâche arrive, l'autre est notifié. */
function PhoneMock({ t }: { t: Content }) {
  const reduce = useReducedMotion();
  const [done, setDone] = useState<number[]>([0]);
  const [added, setAdded] = useState(false);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (reduce) {
      setDone([0, 1]);
      setAdded(true);
      return;
    }
    const steps = [
      () => {
        setDone([0, 1]);
        setToast(true);
      },
      () => setToast(false),
      () => setAdded(true),
      () => setDone([0, 1, 2]),
      () => undefined,
      () => {
        setDone([0]);
        setAdded(false);
      },
    ];
    let i = 0;
    const id = setInterval(() => {
      steps[i % steps.length]!();
      i++;
    }, 1900);
    return () => clearInterval(id);
  }, [reduce]);

  const tasks = t.mock.tasks.map((task, i) => ({ ...task, key: `t${i}`, index: i }));

  return (
    <div className="relative">
      <PhoneFrame className="aspect-[9/19]">
        <div className="flex h-full flex-col gap-4 px-5 pt-10 pb-6">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- export statique */}
            <img
              src="/img/icon-192.png"
              alt=""
              width={22}
              height={22}
              className="size-[22px] rounded-md"
            />
            <span className="text-sm font-semibold">Tandem</span>
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight">{t.mock.greeting} 👋</p>
            <p className="text-sm text-text-muted">{t.mock.date}</p>
          </div>
          <div className="flex items-center justify-between text-[0.6875rem] font-semibold tracking-wide text-text-muted uppercase">
            <span>{t.mock.today}</span>
            <span>
              {done.length}/{tasks.length + (added ? 1 : 0)}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {added ? (
                <motion.li
                  key="added"
                  layout
                  initial={{ opacity: 0, y: -16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  <TaskRow
                    title={t.mock.added}
                    meta={t.mock.addedMeta}
                    who="n"
                    done={false}
                    highlight
                  />
                </motion.li>
              ) : null}
              {tasks.map((task) => (
                <motion.li key={task.key} layout transition={{ duration: 0.45, ease: EASE }}>
                  <TaskRow
                    title={task.title}
                    meta={task.meta}
                    who={task.who}
                    done={done.includes(task.index)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="mt-auto flex flex-col gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3">
            <span className="text-[0.625rem] font-semibold tracking-wide text-text-muted uppercase">
              {t.balance.card}
            </span>
            {t.balance.rows.slice(0, 2).map((r) => (
              <div key={r.name} className="flex items-center gap-2">
                <span className="w-12 truncate text-[0.6875rem]">{r.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: `${r.value}%` }}
                    transition={{ duration: 1.2, ease: EASE, delay: 1 }}
                    className={clsx(
                      'block h-full rounded-full',
                      r.color === 'ocean' ? 'bg-member-ocean' : 'bg-member-sage',
                    )}
                  />
                </span>
              </div>
            ))}
          </div>
          <nav
            aria-hidden
            className="-mx-5 -mb-6 flex justify-around border-t border-border bg-surface px-2 pt-2.5 pb-4"
          >
            {[Sun, ListChecks, ShoppingCart, CalendarDays, Settings].map((Icon, i) => (
              <span
                key={i}
                className={clsx(
                  'flex h-7 w-10 items-center justify-center rounded-full',
                  i === 0 ? 'bg-accent/15 text-accent' : 'text-text-muted',
                )}
              >
                <Icon className="size-4" />
              </span>
            ))}
          </nav>
        </div>
      </PhoneFrame>

      {/* Notification reçue par l'autre. */}
      <AnimatePresence>
        {toast ? (
          <motion.div
            key="toast"
            initial={{ opacity: 0, x: -30, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="absolute top-24 -left-6 z-20 flex max-w-[15rem] items-center gap-3 rounded-2xl border border-border bg-surface/95 p-3 text-sm shadow-xl backdrop-blur sm:-left-20"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-member-sage text-xs font-semibold text-white">
              N
            </span>
            <span className="leading-snug">{t.mock.toast}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Ajout rapide en langage naturel. */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-[4.5%] -right-20 z-20 hidden items-center gap-2 rounded-2xl border border-border bg-surface/95 px-3.5 py-2.5 text-sm shadow-xl backdrop-blur sm:flex"
      >
        <Sparkles className="size-4 text-accent" aria-hidden />
        <span>
          « {t.mock.added} <span className="text-accent">{t.mock.addedMeta.split(' · ')[0]}</span> »
        </span>
      </motion.div>
    </div>
  );
}

function TaskRow({
  title,
  meta,
  who,
  done,
  highlight = false,
}: {
  title: string;
  meta: string;
  who: keyof typeof WHO;
  done: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-500',
        highlight ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface',
      )}
    >
      <motion.span
        animate={{
          backgroundColor: done ? 'var(--color-accent)' : 'rgba(0,0,0,0)',
          borderColor: done ? 'var(--color-accent)' : 'var(--color-border)',
        }}
        transition={{ duration: 0.3 }}
        className="flex size-5 shrink-0 items-center justify-center rounded-md border-2"
      >
        <AnimatePresence>
          {done ? (
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            >
              <Check className="size-3.5 text-accent-fg" strokeWidth={3} aria-hidden />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.span>
      <span className="min-w-0 flex-1">
        <span className="relative block truncate text-[0.8125rem] font-medium">
          <span className={clsx('transition-colors duration-300', done && 'text-text-muted')}>
            {title}
          </span>
          <motion.span
            aria-hidden
            initial={false}
            animate={{ scaleX: done ? 1 : 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="absolute top-1/2 left-0 h-px w-full origin-left bg-text-muted"
          />
        </span>
        <span className="block truncate text-[0.6875rem] text-text-muted">{meta}</span>
      </span>
      <span className={clsx('size-2 shrink-0 rounded-full', WHO[who])} aria-hidden />
    </div>
  );
}
