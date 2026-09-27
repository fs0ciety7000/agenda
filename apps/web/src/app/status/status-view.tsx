'use client';

import type { ComponentStatus, StatusPageDto } from '@agenda/contracts';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const TONE: Record<ComponentStatus, { text: string; bg: string; icon: typeof CheckCircle2 }> = {
  operational: { text: 'text-success', bg: 'bg-success', icon: CheckCircle2 },
  degraded: { text: 'text-warning', bg: 'bg-warning', icon: AlertTriangle },
  down: { text: 'text-danger', bg: 'bg-danger', icon: XCircle },
  unknown: { text: 'text-text-muted', bg: 'bg-text-muted', icon: CircleHelp },
};

/** Couleur d'une journée selon sa disponibilité (gris : pas de mesure). */
function dayClass(uptime: number | null) {
  if (uptime === null) return 'bg-border';
  if (uptime >= 99.9) return 'bg-success';
  if (uptime >= 99) return 'bg-success/60';
  if (uptime >= 95) return 'bg-warning';
  return 'bg-danger';
}

export function StatusView() {
  const t = useTranslations('status');
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const status = useQuery({
    queryKey: ['public-status'],
    queryFn: () => api<StatusPageDto>('/v1/status'),
    refetchInterval: 60_000,
  });
  const data = status.data;
  const percent = (n: number) => `${format.number(n, { maximumFractionDigits: 2 })} %`;
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const overall = data?.status ?? 'unknown';
  const Overall = TONE[overall].icon;

  return (
    <main id="main" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:py-16">
      <header className="flex flex-col gap-2">
        <Link href="/about" className="text-sm text-text-muted hover:text-text">
          Agenda G & N
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-[0.9375rem] text-text-muted">{t('intro')}</p>
      </header>

      <section
        aria-live="polite"
        className={cn(
          'flex items-center gap-3 rounded-lg border px-5 py-4 text-lg font-medium',
          status.isError ? 'border-danger text-danger' : 'border-border',
        )}
      >
        {status.isError ? (
          <>
            <XCircle aria-hidden className="size-6 shrink-0" />
            {t('unreachable')}
          </>
        ) : (
          <>
            <Overall aria-hidden className={cn('size-6 shrink-0', TONE[overall].text)} />
            {data ? t(`overall.${overall}`) : t('loading')}
          </>
        )}
      </section>

      {data && data.components.length > 0 && (
        <section aria-labelledby="st-components" className="flex flex-col gap-3">
          <h2
            id="st-components"
            className="text-sm font-medium uppercase tracking-wide text-text-muted"
          >
            {t('components')}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {data.components.map((c) => {
              const Icon = TONE[c.status].icon;
              return (
                <li key={c.key} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{t(`component.${c.key}`)}</p>
                    <p className={cn('flex items-center gap-1.5 text-sm', TONE[c.status].text)}>
                      <Icon aria-hidden className="size-4" />
                      {t(`state.${c.status}`)}
                      {c.latencyMs !== null && c.status === 'operational' && (
                        <span className="text-text-muted">· {c.latencyMs} ms</span>
                      )}
                    </p>
                  </div>
                  <div
                    role="img"
                    aria-label={t('barsLabel', {
                      name: t(`component.${c.key}`),
                      uptime: c.uptime90 === null ? '—' : percent(c.uptime90),
                    })}
                    className="flex h-8 items-stretch gap-[2px]"
                  >
                    {c.days.map((d) => (
                      <span
                        key={d.date}
                        title={`${day(d.date)} : ${d.uptime === null ? t('noData') : percent(d.uptime)}`}
                        className={cn('flex-1 rounded-[2px]', dayClass(d.uptime))}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[0.75rem] text-text-muted">
                    <span>{t('daysAgo')}</span>
                    <span>
                      {c.uptime90 === null
                        ? t('noData')
                        : t('uptime', { value: percent(c.uptime90) })}
                    </span>
                    <span>{t('today')}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data && (
        <section aria-labelledby="st-incidents" className="flex flex-col gap-3">
          <h2
            id="st-incidents"
            className="text-sm font-medium uppercase tracking-wide text-text-muted"
          >
            {t('incidents')}
          </h2>
          {data.incidents.length === 0 ? (
            <p className="text-[0.9375rem] text-text-muted">{t('noIncident')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.incidents.map((i) => {
                const minutes = Math.max(
                  1,
                  Math.round(
                    ((i.resolvedAt ? new Date(i.resolvedAt) : now).getTime() -
                      new Date(i.startedAt).getTime()) /
                      60_000,
                  ),
                );
                return (
                  <li key={i.id} className="rounded-lg border border-border bg-surface px-5 py-3">
                    <p className="font-medium">
                      {t(`component.${i.component}`)}{' '}
                      <span
                        className={cn(
                          'text-sm font-normal',
                          i.resolvedAt ? 'text-success' : 'text-danger',
                        )}
                      >
                        · {t(i.resolvedAt ? 'resolved' : 'ongoing')}
                      </span>
                    </p>
                    <p className="text-sm text-text-muted">
                      {when(i.startedAt)} · {t('duration', { minutes })}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {data && (
        <p className="text-[0.8125rem] text-text-muted">
          {t('updated', { when: format.relativeTime(new Date(data.updatedAt), now) })}
        </p>
      )}
    </main>
  );
}
