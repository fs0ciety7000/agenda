'use client';

import { ChevronRight } from 'lucide-react';
import { LazyMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { APP_URL, APK_URL, PLAY_URL } from '@/lib/config';
import type { Content } from '@/lib/content';
import { PauseButton, useTicker } from './ticker';
import { ButtonLink } from './ui';

const WHO = {
  g: { initial: 'E', color: 'var(--gn-member-ocean)' },
  n: { initial: 'T', color: 'var(--gn-member-sage)' },
  both: { initial: 'ET', color: 'var(--gn-member-plum)' },
} as const;

// Motion (glisser au doigt) chargé à part, après l'affichage : le reste de la page n'en paie pas le poids.
const loadFeatures = () => import('motion/react').then((mod) => mod.domMax);

/** Ouverture claire : le titre, et la pile de tâches qui se distribue (la carte du dessus part). */
export function Hero({ t }: { t: Content }) {
  const { tick, paused, toggle, next } = useTicker(2200);
  const tasks = t.mock.tasks;
  const deck = [0, 1, 2].map((k) => ({ k, task: tasks[(tick + k) % tasks.length]! })).reverse();
  return (
    <section id="top" className="relative overflow-hidden px-5 pt-32 pb-10 sm:pt-40">
      <svg
        aria-hidden
        viewBox="0 0 132 88"
        fill="none"
        className="pointer-events-none absolute -top-10 -right-56 hidden h-[32rem] w-[48rem] opacity-[0.14] lg:block"
      >
        <g className="spin-slow" style={{ transformOrigin: '44px 44px' }}>
          <circle
            cx="44"
            cy="44"
            r="36"
            stroke="var(--gn-brand-cobalt)"
            strokeWidth="1.2"
            strokeDasharray="2 3"
          />
        </g>
        <g className="spin-slow-reverse" style={{ transformOrigin: '88px 44px' }}>
          <circle
            cx="88"
            cy="44"
            r="36"
            stroke="var(--gn-brand-apricot)"
            strokeWidth="1.2"
            strokeDasharray="2 3"
          />
        </g>
      </svg>
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-14">
        <div className="flex min-w-0 flex-[1_1_32rem] flex-col gap-7">
          <p className="rise text-sm font-medium text-text-muted">{t.hero.badge}</p>
          <h1 className="font-display text-[clamp(3.25rem,9vw,7.5rem)] leading-[0.92] tracking-[-0.035em]">
            <span className="rise block" style={{ animationDelay: '80ms' }}>
              {t.hero.title[0]}
            </span>
            <span className="rise block text-accent italic" style={{ animationDelay: '200ms' }}>
              {t.hero.title[1]}
            </span>
          </h1>
          <p
            className="rise max-w-xl text-lg leading-relaxed text-text-muted sm:text-xl"
            style={{ animationDelay: '320ms' }}
          >
            {t.hero.text}
          </p>
          <div className="rise flex flex-wrap gap-3" style={{ animationDelay: '440ms' }}>
            <ButtonLink href={`${APP_URL}/register`} className="min-h-14 px-7 text-base">
              {t.hero.primary}
            </ButtonLink>
            <ButtonLink
              href={PLAY_URL ?? APK_URL}
              variant="secondary"
              className="min-h-14 px-7 text-base"
            >
              {t.hero.android}
            </ButtonLink>
          </div>
          <p className="text-sm text-text-muted">
            {t.hero.note}{' '}
            <a
              href={`${APP_URL}/login`}
              className="font-medium text-text underline underline-offset-4"
            >
              {t.hero.already} {t.hero.login}
            </a>
          </p>
        </div>

        {/* Illustration : la même liste lue par les lecteurs d'écran une seule fois (sr-only). */}
        <div className="relative w-full flex-[0_1_26rem]">
          <ul className="sr-only">
            {tasks.map((task) => (
              <li key={task.title}>
                {task.title}, {task.meta}
              </li>
            ))}
          </ul>
          <LazyMotion features={loadFeatures} strict>
            <div aria-hidden className="relative h-[22rem]">
              {deck.map(({ k, task }) => (
                <div
                  key={`${tick + k}`}
                  className={k === 0 ? 'deal' : undefined}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: `${1.25 + k * 6.5}rem`,
                    // Cartes du fond plus petites, jamais transparentes (contraste du texte).
                    transform: `scale(${1 - k * 0.05})`,
                    zIndex: 3 - k,
                  }}
                >
                  {k === 0 ? (
                    // Carte du dessus : on la jette d'un geste, à gauche ou à droite ; « Carte suivante »
                    // fait la même chose au clavier (WCAG 2.5.7).
                    <m.div
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.9}
                      whileDrag={{ rotate: 4, scale: 1.02 }}
                      onDragEnd={(_, info) => {
                        if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) next();
                      }}
                      className="cursor-grab touch-pan-y active:cursor-grabbing"
                    >
                      <Card task={task} />
                    </m.div>
                  ) : (
                    <Card task={task} />
                  )}
                </div>
              ))}
            </div>
          </LazyMotion>
          <button
            type="button"
            onClick={next}
            aria-label={t.motion.next}
            className="absolute right-12 bottom-0 flex size-11 items-center justify-center rounded-full text-text-muted hover:bg-surface-muted hover:text-text"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <PauseButton
            paused={paused}
            onToggle={toggle}
            labels={t.motion}
            className="absolute right-0 bottom-0 flex size-11 items-center justify-center rounded-full text-text-muted hover:bg-surface-muted hover:text-text"
          />
        </div>
      </div>
    </section>
  );
}

type Task = Content['mock']['tasks'][number];

function Card({ task }: { task: Task }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-surface px-6 py-5 shadow-[0_18px_40px_rgb(20_21_43/0.10)]">
      <span
        className="grid size-11 flex-none place-items-center rounded-full text-sm font-semibold text-on-member"
        style={{ background: WHO[task.who].color }}
      >
        {WHO[task.who].initial}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-lg font-semibold">{task.title}</span>
        <span className="text-sm text-text-muted tabular-nums">{task.meta}</span>
      </span>
    </div>
  );
}
