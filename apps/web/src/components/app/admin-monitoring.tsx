'use client';

import type { AdminMonitoringDto } from '@agenda/contracts';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { Card, SectionTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Administration → Surveillance : trafic, erreurs, temps de réponse, sondes, incidents. */
export function AdminMonitoring() {
  const t = useTranslations('admin.monitoring');
  const tc = useTranslations('status.component');
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const q = useQuery({
    queryKey: ['admin', 'monitoring'],
    queryFn: () => api<AdminMonitoringDto>('/v1/admin/monitoring'),
    refetchInterval: 60_000,
  });
  const mb = (n: number) => `${format.number(n / 1024 / 1024, { maximumFractionDigits: 0 })} Mo`;

  return (
    <section aria-labelledby="a-monitoring" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle id="a-monitoring">{t('title')}</SectionTitle>
        <Link
          href="/status"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          {t('publicPage')}
          <ExternalLink aria-hidden className="size-3.5" />
        </Link>
      </div>
      {!q.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                [t('requests24h'), format.number(q.data.totals.requests)],
                [t('errors24h'), format.number(q.data.totals.errors5xx)],
                [t('avgMs'), `${q.data.totals.avgMs} ms`],
                [t('slow'), format.number(q.data.totals.slow)],
              ] as const
            ).map(([label, value]) => (
              <Card key={label} className="flex flex-col gap-1 p-4">
                <dt className="text-[0.8125rem] text-text-muted">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              </Card>
            ))}
          </dl>

          <Card className="flex flex-col gap-4">
            <Chart
              title={t('chartRequests')}
              values={q.data.buckets.map((b) => b.requests)}
              highlight={q.data.buckets.map((b) => b.errors5xx)}
              labels={q.data.buckets.map((b) => b.at)}
              unit=""
              legendHighlight={t('legendErrors')}
            />
            <Chart
              title={t('chartLatency')}
              values={q.data.buckets.map((b) => b.avgMs)}
              labels={q.data.buckets.map((b) => b.at)}
              unit=" ms"
            />
          </Card>

          <Card className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('checks')}</p>
            <ul className="flex flex-col gap-1.5">
              {q.data.checks.map((c) => (
                <li
                  key={c.component}
                  className="flex flex-wrap items-center gap-2 text-[0.9375rem]"
                >
                  {c.ok ? (
                    <CheckCircle2 aria-hidden className="size-4 text-success" />
                  ) : (
                    <XCircle aria-hidden className="size-4 text-danger" />
                  )}
                  <span className="font-medium">{tc(c.component)}</span>
                  <span className="text-[0.8125rem] text-text-muted">
                    {[
                      c.latencyMs !== null ? `${c.latencyMs} ms` : null,
                      c.detail,
                      format.relativeTime(new Date(c.checkedAt), now),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
              {q.data.checks.length === 0 && (
                <li className="text-[0.9375rem] text-text-muted">{t('noChecks')}</li>
              )}
            </ul>
          </Card>

          {q.data.incidents.length > 0 && (
            <Card className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t('incidents')}</p>
              <ul className="flex flex-col gap-1.5 text-[0.875rem]">
                {q.data.incidents.map((i) => (
                  <li key={i.id}>
                    <span
                      className={cn('font-medium', i.resolvedAt ? 'text-success' : 'text-danger')}
                    >
                      {tc(i.component)}
                    </span>{' '}
                    <span className="text-text-muted">
                      ·{' '}
                      {format.dateTime(new Date(i.startedAt), {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      ·{' '}
                      {i.resolvedAt
                        ? t('resolvedAfter', { minutes: minutesBetween(i.startedAt, i.resolvedAt) })
                        : t('ongoing')}
                      {i.detail ? ` · ${i.detail}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-[0.8125rem]">
              <caption className="px-4 pt-3 text-left text-sm font-medium">{t('routes')}</caption>
              <thead className="text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('col.route')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('col.count')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('col.avg')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('col.max')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('col.errors')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {q.data.routes.map((r) => (
                  <tr key={r.route}>
                    <td className="max-w-[22rem] truncate px-4 py-1.5 font-mono" title={r.route}>
                      {r.route}
                    </td>
                    <td className="px-4 py-1.5 text-right">{r.count}</td>
                    <td className="px-4 py-1.5 text-right">{r.avgMs} ms</td>
                    <td className="px-4 py-1.5 text-right">{r.maxMs} ms</td>
                    <td className={cn('px-4 py-1.5 text-right', r.errors > 0 && 'text-danger')}>
                      {r.errors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-text-muted">
            <Activity aria-hidden className="size-3.5" />
            <span>
              {t('uptime', {
                hours: format.number(q.data.process.uptimeSeconds / 3600, {
                  maximumFractionDigits: 1,
                }),
              })}
            </span>
            <span>RSS {mb(q.data.process.rssBytes)}</span>
            <span>heap {mb(q.data.process.heapUsedBytes)}</span>
            <span>{t('loopLag', { ms: q.data.process.eventLoopLagMs })}</span>
            <span>Node {q.data.process.node}</span>
          </p>
        </>
      )}
    </section>
  );
}

const minutesBetween = (a: string, b: string) =>
  Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));

/** Barres (15 min) sur 24 h ; `highlight` : part mise en évidence (erreurs) en bas de chaque barre. */
function Chart({
  title,
  values,
  highlight,
  labels,
  unit,
  legendHighlight,
}: {
  title: string;
  values: number[];
  highlight?: number[];
  labels: string[];
  unit: string;
  legendHighlight?: string;
}) {
  const format = useFormatter();
  const max = Math.max(1, ...values);
  const hour = (iso: string) =>
    format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' });
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex justify-between text-sm font-medium">
        <span>{title}</span>
        <span className="text-[0.8125rem] font-normal text-text-muted">
          max {format.number(max)}
          {unit}
          {legendHighlight && (
            <>
              {' · '}
              <span className="text-danger">■</span> {legendHighlight}
            </>
          )}
        </span>
      </figcaption>
      <div className="flex h-24 items-end gap-px" aria-hidden>
        {values.map((v, i) => (
          <div
            key={labels[i]}
            title={`${hour(labels[i]!)} : ${format.number(v)}${unit}${highlight?.[i] ? ` (${highlight[i]} ${legendHighlight})` : ''}`}
            className="relative flex-1 rounded-t-[2px] bg-accent/70"
            style={{ height: `${Math.max(v ? 3 : 0, (v / max) * 100)}%` }}
          >
            {highlight && highlight[i]! > 0 && (
              <span
                className="absolute inset-x-0 bottom-0 bg-danger"
                style={{ height: `${Math.max(8, (highlight[i]! / Math.max(v, 1)) * 100)}%` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[0.75rem] text-text-muted">
        <span>{labels[0] ? hour(labels[0]) : ''}</span>
        <span>{labels.at(-1) ? hour(labels.at(-1)!) : ''}</span>
      </div>
    </figure>
  );
}
