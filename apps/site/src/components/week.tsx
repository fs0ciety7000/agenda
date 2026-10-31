'use client';

import clsx from 'clsx';
import type { Content } from '@/lib/content';
import { PauseButton, useTicker } from './ticker';
import { Reveal } from './ui';

const WHO = {
  e: { initial: 'E', name: 'Emma', color: 'var(--gn-member-ocean)' },
  t: { initial: 'T', name: 'Tom', color: 'var(--gn-member-sage)' },
  both: { initial: 'ET', name: 'Emma & Tom', color: 'var(--gn-member-plum)' },
} as const;

/** Lundi → dimanche dans la langue de la page (Intl), à partir d'un lundi fixe. */
const dayNames = (locale: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 9, 5 + i)),
    ),
  );

/** La semaine : le jour en cours s'allume, les jours passés sont cochés. */
export function Week({ t }: { t: Content }) {
  const { tick, paused, toggle } = useTicker(1600);
  const names = dayNames(t.lang.current);
  const today = tick % 7;
  return (
    <section id="week" className="px-5 py-20 sm:py-28">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-3xl flex-col gap-3">
            <span className="text-sm font-medium text-text-muted">{t.week.eyebrow}</span>
            <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-none tracking-[-0.03em]">
              {t.week.title[0]} <span className="italic">{t.week.title[1]}</span>
            </h2>
          </div>
          <p className="max-w-sm text-lg leading-relaxed text-text-muted">{t.week.text}</p>
        </Reveal>
        <div className="relative">
          <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7 lg:[&>li]:min-h-48">
            {t.week.days.map((tasks, i) => (
              <li
                key={names[i]}
                aria-current={i === today ? 'date' : undefined}
                className={clsx(
                  'flex min-h-32 flex-col gap-2.5 rounded-[1.25rem] p-3.5 transition-[background-color,color,transform] duration-300',
                  i === today
                    ? '-translate-y-2 bg-text text-bg'
                    : i < today
                      ? 'bg-text/[0.04] text-text-muted'
                      : 'bg-text/[0.08] text-text',
                )}
              >
                <span className="text-xs font-semibold tracking-[0.1em] uppercase">{names[i]}</span>
                {tasks.map(([title, who]) => (
                  <span
                    key={title}
                    className={clsx(
                      'flex items-center gap-2 rounded-xl bg-surface px-2.5 py-2 text-sm leading-tight text-text',
                      i < today && 'line-through opacity-60',
                    )}
                  >
                    <span
                      className="grid size-6 flex-none place-items-center rounded-full text-[0.6875rem] font-semibold text-on-member"
                      style={{ background: WHO[who].color }}
                      aria-hidden
                    >
                      {WHO[who].initial}
                    </span>
                    {title}
                    <span className="sr-only">, {WHO[who].name}</span>
                  </span>
                ))}
              </li>
            ))}
          </ol>
          <PauseButton
            paused={paused}
            onToggle={toggle}
            labels={t.motion}
            className="absolute -top-14 right-0 flex size-11 items-center justify-center rounded-full text-text-muted hover:bg-surface-muted hover:text-text"
          />
        </div>
      </div>
    </section>
  );
}
