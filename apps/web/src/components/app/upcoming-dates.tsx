'use client';

import type { ImportantDateKind } from '@agenda/contracts';
import { CalendarDays, Cake, PartyPopper, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSession } from '@/components/app/household-context';
import { useImportantDates } from '@/lib/important-dates';

const ICONS = {
  BIRTHDAY: Cake,
  ANNIVERSARY: PartyPopper,
  MAINTENANCE: Wrench,
  OTHER: CalendarDays,
};

/** Icône du type de date (décorative : le type se lit dans le titre). */
export function DateKindIcon({ kind }: { kind: ImportantDateKind }) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden className="size-5 shrink-0 stroke-[1.5] text-text-muted" />;
}

/** Combien de jours à l'avance une date apparaît sur Aujourd'hui. */
const HORIZON_DAYS = 14;

/** Aujourd'hui : les dates importantes des deux semaines à venir (rien s'il n'y en a pas). */
export function UpcomingDates() {
  const t = useTranslations('importantDates');
  const { household } = useSession();
  const dates = useImportantDates(household.id);
  const soon = (dates.data ?? []).filter((d) => d.daysLeft != null && d.daysLeft <= HORIZON_DAYS);
  if (!soon.length) return null;
  return (
    <section aria-labelledby="soon-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="soon-heading"
          className="text-xs font-medium uppercase tracking-[0.04em] text-text-muted"
        >
          {t('soon')}
        </h2>
        <Link href="/dates" className="text-sm text-accent hover:underline">
          {t('seeAll')}
        </Link>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {soon.slice(0, 3).map((d) => (
          <li key={d.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
            <DateKindIcon kind={d.kind} />
            <span className="min-w-0 flex-1 break-words text-[0.9375rem]">{d.title}</span>
            <span className="shrink-0 text-[0.8125rem] text-text-muted">
              {t('when', { days: d.daysLeft ?? 0 })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
