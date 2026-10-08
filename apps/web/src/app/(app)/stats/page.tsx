'use client';

import type { StatsDto } from '@agenda/contracts';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/components/app/household-context';
import { MemberAvatar } from '@/components/app/member-avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/states';
import { useStats } from '@/lib/notifications';

/** Bilan factuel des tâches partagées : aucun classement, aucune note. */
export default function StatsPage() {
  const t = useTranslations('stats');
  const tr = useTranslations('review');
  const { household } = useSession();
  const [days, setDays] = useState<'7' | '30'>('7');
  const stats = useStats(household.id, days === '7' ? 7 : 30);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <Segmented
          label={t('period')}
          value={days}
          onChange={setDays}
          options={[
            { value: '7', label: t('days7') },
            { value: '30', label: t('days30') },
          ]}
        />
      </div>
      <p className="-mt-3 text-[0.9375rem] text-text-muted">{t('intro')}</p>
      <Link
        href="/review"
        className="-mt-3 self-start text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        {tr('title')} →
      </Link>
      {!stats.data ? <Skeleton className="h-64 w-full" /> : <StatsContent data={stats.data} />}
    </div>
  );
}

function StatsContent({ data }: { data: StatsDto }) {
  const t = useTranslations('stats');
  const format = useFormatter();
  const { household } = useSession();
  const hours = (m: number) =>
    m < 60
      ? t('minutes', { m })
      : t('hours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
  const maxDay = Math.max(1, ...data.perDay.map((d) => d.done));
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.done));
  const maxMember = Math.max(1, ...data.byMember.map((m) => m.done));
  const members = new Map(household.members.map((m) => [m.id, m]));
  const dayLabel = (d: string, style: 'short' | 'long') =>
    format.dateTime(
      new Date(`${d}T12:00:00`),
      style === 'short'
        ? { weekday: 'narrow' }
        : { weekday: 'long', day: 'numeric', month: 'long' },
    );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t('done')} value={String(data.done)} />
        <Tile label={t('time')} value={hours(data.doneMinutes)} />
        <Tile label={t('late')} value={String(data.doneLate)} hint={t('lateHint')} />
        <Tile label={t('overdue')} value={String(data.overdue)} hint={t('overdueHint')} />
      </div>

      <section aria-labelledby="st-days" className="flex flex-col gap-3">
        <SectionTitle id="st-days">{t('perDay')}</SectionTitle>
        <Card>
          {data.done === 0 ? (
            <p className="text-[0.9375rem] text-text-muted">{t('empty')}</p>
          ) : (
            <>
              <div
                className="relative flex h-40 items-end gap-[2px] border-b border-border"
                aria-hidden
              >
                {data.perDay.map((d) => (
                  <div key={d.date} className="group relative flex h-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-[4px] bg-accent"
                      style={{
                        height: d.done ? `${(d.done / maxDay) * 100}%` : 0,
                        minHeight: d.done ? 4 : 0,
                      }}
                    />
                    {/* Infobulle au survol (la même information est dans le tableau ci-dessous). */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-sm bg-text px-2 py-1 text-[0.75rem] text-bg group-hover:block">
                      {dayLabel(d.date, 'long')} · {t('doneCount', { count: d.done })}
                    </div>
                  </div>
                ))}
              </div>
              {data.days === 7 && (
                <div
                  className="mt-1 flex gap-[2px] text-center text-[0.75rem] text-text-muted"
                  aria-hidden
                >
                  {data.perDay.map((d) => (
                    <span key={d.date} className="flex-1">
                      {dayLabel(d.date, 'short')}
                    </span>
                  ))}
                </div>
              )}
              <details className="mt-3 text-[0.875rem]">
                <summary className="cursor-pointer text-text-muted">{t('showTable')}</summary>
                <table className="mt-2 w-full text-left">
                  <caption className="sr-only">{t('perDay')}</caption>
                  <thead>
                    <tr className="text-text-muted">
                      <th scope="col" className="py-1 font-normal">
                        {t('day')}
                      </th>
                      <th scope="col" className="py-1 text-right font-normal">
                        {t('done')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perDay.map((d) => (
                      <tr key={d.date} className="border-t border-border">
                        <td className="py-1">{dayLabel(d.date, 'long')}</td>
                        <td className="py-1 text-right tabular-nums">{d.done}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </Card>
      </section>

      {data.byCategory.length > 0 && (
        <section aria-labelledby="st-cat" className="flex flex-col gap-3">
          <SectionTitle id="st-cat">{t('byCategory')}</SectionTitle>
          <Card className="flex flex-col gap-3">
            {data.byCategory.map((c) => (
              <BarRow
                key={c.categoryId ?? 'none'}
                label={c.name ? `${c.emoji ? `${c.emoji} ` : ''}${c.name}` : t('noCategory')}
                value={c.done}
                max={maxCat}
                detail={`${t('doneCount', { count: c.done })}${c.minutes ? ` · ${hours(c.minutes)}` : ''}`}
              />
            ))}
          </Card>
        </section>
      )}

      <section aria-labelledby="st-who" className="flex flex-col gap-3">
        <SectionTitle id="st-who">{t('byMember')}</SectionTitle>
        <Card className="flex flex-col gap-3">
          {data.byMember.map((m) => {
            const member = members.get(m.memberId);
            return (
              <BarRow
                key={m.memberId}
                label={member?.displayName ?? '?'}
                icon={member ? <MemberAvatar member={member} size="sm" /> : null}
                value={m.done}
                max={maxMember}
                detail={`${t('doneCount', { count: m.done })}${m.minutes ? ` · ${hours(m.minutes)}` : ''}`}
              />
            );
          })}
          <p className="text-[0.8125rem] text-text-muted">{t('memberHint')}</p>
        </Card>
      </section>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-[0.8125rem] text-text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-[0.75rem] text-text-muted">{hint}</span>}
    </Card>
  );
}

/** Barre horizontale ; l'identité est portée par le libellé (nom, initiale), jamais par la couleur seule. */
function BarRow({
  label,
  icon,
  value,
  max,
  detail,
  barClass = 'bg-accent',
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  max: number;
  detail: string;
  /** Couleur de la barre (celle du membre, avec son nom et son initiale à côté). */
  barClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-[0.9375rem]">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <span className="text-[0.8125rem] text-text-muted tabular-nums">{detail}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-muted" aria-hidden>
        <div
          className={`h-2 rounded-full ${barClass}`}
          style={{ width: `${(value / max) * 100}%`, minWidth: value ? 8 : 0 }}
        />
      </div>
    </div>
  );
}
