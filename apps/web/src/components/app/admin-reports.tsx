'use client';

import type { AdminReportDto, ReportStatus } from '@agenda/contracts';
import { ImageIcon, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { DiagnosticsList } from '@/components/app/report-diagnostics';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAdminReportMutations, useAdminReports } from '@/lib/reports';

const FILTERS = ['ACTIVE', 'RESOLVED', 'ALL'] as const;
const STATUSES: ReportStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

/** Administration : signalements envoyés depuis le site et l'app (à traiter, résolus, tous). */
export function AdminReports() {
  const t = useTranslations('admin.reports');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ACTIVE');
  const reports = useAdminReports(filter);
  return (
    <section id="reports" aria-labelledby="a-reports" className="flex scroll-mt-4 flex-col gap-3">
      <SectionTitle id="a-reports">{t('title')}</SectionTitle>
      <Segmented
        label={t('filter')}
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f, label: t(`filters.${f}`) }))}
      />
      {!reports.data ? (
        <Skeleton className="h-24 w-full" />
      ) : reports.data.length === 0 ? (
        <Card>
          <p className="text-[0.9375rem] text-text-muted">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.data.map((r) => (
            <li key={r.id}>
              <ReportCard report={r} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportCard({ report: r }: { report: AdminReportDto }) {
  const t = useTranslations('admin.reports');
  const tr = useTranslations('report');
  const format = useFormatter();
  const toast = useToast();
  const { update, remove } = useAdminReportMutations();
  const [reply, setReply] = useState(r.reply ?? '');
  const replyId = useId();
  const onError = () => toast({ message: t('error'), tone: 'error' });
  return (
    <Card className="flex flex-col gap-3">
      <details>
        <summary className="cursor-pointer list-none">
          <p className="font-medium">
            {r.kind === 'BUG' ? '🐞 ' : ''}
            {r.title}
          </p>
          <p className="text-[0.8125rem] text-text-muted">
            {tr(`kinds.${r.kind}`)} · {r.author.displayName} ·{' '}
            {format.dateTime(new Date(r.createdAt), { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
            <span className="font-medium text-text">{tr(`statuses.${r.status}`)}</span>
          </p>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="whitespace-pre-line text-[0.9375rem]">{r.description}</p>
          <p className="text-[0.8125rem] text-text-muted">
            {r.author.email} · {r.allowContact ? t('contactYes') : t('contactNo')}
          </p>
          {r.hasScreenshot && (
            <a
              href={`/v1/admin/reports/${r.id}/screenshot`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-[0.9375rem] text-accent underline-offset-4 hover:underline"
            >
              <ImageIcon aria-hidden className="size-4" />
              {t('screenshot')}
            </a>
          )}
          {r.diagnostics ? (
            <DiagnosticsList
              diagnostics={r.diagnostics}
              className="rounded-md bg-surface-muted p-3 text-[0.8125rem]"
            />
          ) : (
            <p className="text-[0.8125rem] text-text-muted">{t('noDiagnostics')}</p>
          )}

          <Select
            label={t('status')}
            value={r.status}
            onChange={(e) =>
              update.mutate({ id: r.id, status: e.target.value as ReportStatus }, { onError })
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {tr(`statuses.${s}`)}
              </option>
            ))}
          </Select>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={replyId} className="text-sm font-medium">
              {t('reply')}
            </label>
            <textarea
              id={replyId}
              value={reply}
              maxLength={5000}
              rows={3}
              onChange={(e) => setReply(e.target.value)}
              className="rounded-md border border-border-strong bg-surface px-3 py-2.5 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
            <p className="text-[0.8125rem] text-text-muted">
              {r.allowContact ? t('replyHintEmail') : t('replyHintApp')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!reply.trim() || reply.trim() === (r.reply ?? '') || update.isPending}
              onClick={() =>
                update.mutate(
                  { id: r.id, reply: reply.trim() },
                  { onSuccess: () => toast({ message: t('replied') }), onError },
                )
              }
            >
              {t('sendReply')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(t('deleteConfirm'))) remove.mutate(r.id, { onError });
              }}
            >
              <Trash2 aria-hidden className="size-4" />
              {t('delete')}
            </Button>
          </div>
        </div>
      </details>
    </Card>
  );
}
