'use client';

import {
  REPORT_SCREENSHOT_MAX_BYTES,
  REPORT_SCREENSHOT_TYPES,
  type ReportDto,
  type ReportKind,
} from '@agenda/contracts';
import { BookOpen, ImagePlus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { DiagnosticsList } from '@/components/app/report-diagnostics';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import { usePendingChanges } from '@/lib/offline';
import { collectDiagnostics, useMyReports, useReportMutations } from '@/lib/reports';

const KINDS: ReportKind[] = ['BUG', 'IDEA', 'QUESTION', 'OTHER'];

export function ReportView({ docsUrl }: { docsUrl: string }) {
  const t = useTranslations('report');
  const params = useSearchParams();
  const initialKind = (KINDS as string[]).includes(params.get('kind') ?? '')
    ? (params.get('kind') as ReportKind)
    : 'BUG';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[0.9375rem] text-text-muted">{t('intro')}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem]">
          <a
            href={`${docsUrl}/guide/faq`}
            className="inline-flex items-center gap-1.5 text-accent underline-offset-4 hover:underline"
          >
            <BookOpen aria-hidden className="size-4" />
            {t('faq')}
          </a>
          <Link href="/status" className="text-accent underline-offset-4 hover:underline">
            {t('status')}
          </Link>
        </p>
      </div>
      <ReportForm initialKind={initialKind} from={params.get('from')} />
      <MyReports />
    </div>
  );
}

function ReportForm({ initialKind, from }: { initialKind: ReportKind; from: string | null }) {
  const t = useTranslations('report');
  const tErr = useTranslations('errors');
  const toast = useToast();
  const { send } = useReportMutations();
  const pending = usePendingChanges();
  const [kind, setKind] = useState<ReportKind>(initialKind);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [withDiagnostics, setWithDiagnostics] = useState(false);
  const [allowContact, setAllowContact] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const descId = useId();
  const diagnostics = useMemo(
    () => (typeof window === 'undefined' ? null : collectDiagnostics(from, pending)),
    [from, pending],
  );

  const pick = (f: File | undefined) => {
    setFileError(null);
    if (!f) return setFile(null);
    if (!(REPORT_SCREENSHOT_TYPES as readonly string[]).includes(f.type)) {
      return setFileError(t('screenshotType'));
    }
    if (f.size > REPORT_SCREENSHOT_MAX_BYTES) return setFileError(t('screenshotSize'));
    setFile(f);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate(
      {
        input: {
          kind,
          title: title.trim(),
          description: description.trim(),
          allowContact,
          diagnostics: withDiagnostics ? diagnostics : null,
        },
        file,
      },
      {
        onSuccess: () => {
          setSent(true);
          setTitle('');
          setDescription('');
          setFile(null);
          toast({ message: t('sent') });
        },
        onError: (err) => toast({ message: tErr(errorKey(err) as 'generic'), tone: 'error' }),
      },
    );
  };

  const valid = title.trim().length >= 3 && description.trim().length >= 10;

  return (
    <section aria-labelledby="r-new" className="flex flex-col gap-3">
      <SectionTitle id="r-new">{t('newTitle')}</SectionTitle>
      <Card>
        {sent && (
          <p role="status" className="mb-4 rounded-md bg-surface-muted p-3 text-[0.9375rem]">
            {t('thanks')}
          </p>
        )}
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Segmented
            label={t('kind')}
            value={kind}
            onChange={setKind}
            options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
          />
          <Field
            label={t('fieldTitle')}
            placeholder={t(`placeholders.${kind}`)}
            value={title}
            maxLength={120}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={descId} className="text-sm font-medium">
              {t('fieldDescription')}
            </label>
            <textarea
              id={descId}
              value={description}
              maxLength={5000}
              rows={6}
              required
              aria-describedby={`${descId}-hint`}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-32 rounded-md border border-border bg-surface px-3 py-2.5 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
            <p id={`${descId}-hint`} className="text-[0.8125rem] text-text-muted">
              {t(kind === 'BUG' ? 'descriptionHintBug' : 'descriptionHint')}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('screenshot')}</span>
            {file ? (
              <div className="flex items-center gap-2 text-[0.9375rem]">
                <ImagePlus aria-hidden className="size-4 text-text-muted" />
                <span className="truncate">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                  aria-label={t('screenshotRemove')}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              </div>
            ) : (
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-[0.9375rem] hover:bg-surface-muted focus-within:outline-2 focus-within:outline-accent">
                <ImagePlus aria-hidden className="size-4" />
                {t('screenshotAdd')}
                <input
                  type="file"
                  accept={REPORT_SCREENSHOT_TYPES.join(',')}
                  className="sr-only"
                  onChange={(e) => pick(e.target.files?.[0])}
                />
              </label>
            )}
            <p className="text-[0.8125rem] text-text-muted">{t('screenshotHint')}</p>
            {fileError && (
              <p role="alert" className="text-[0.8125rem] text-danger">
                {fileError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <label className="flex items-start gap-3 text-[0.9375rem]">
              <input
                type="checkbox"
                checked={withDiagnostics}
                onChange={(e) => setWithDiagnostics(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-(--color-accent)"
              />
              <span>
                {t('diagnostics')}
                <span className="block text-[0.8125rem] text-text-muted">
                  {t('diagnosticsHint')}
                </span>
              </span>
            </label>
            {diagnostics && (
              <details className="text-[0.8125rem]">
                <summary className="cursor-pointer text-accent">{t('diagnosticsShow')}</summary>
                <DiagnosticsList diagnostics={diagnostics} className="mt-2" />
              </details>
            )}
            <label className="flex items-start gap-3 text-[0.9375rem]">
              <input
                type="checkbox"
                checked={allowContact}
                onChange={(e) => setAllowContact(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-(--color-accent)"
              />
              <span>
                {t('contact')}
                <span className="block text-[0.8125rem] text-text-muted">{t('contactHint')}</span>
              </span>
            </label>
          </div>

          <p className="text-[0.8125rem] text-text-muted">
            {t('privacy')}{' '}
            <Link href="/privacy" className="text-accent underline underline-offset-4">
              {t('privacyLink')}
            </Link>
          </p>
          <Button type="submit" className="self-start" disabled={!valid || send.isPending}>
            {t('send')}
          </Button>
        </form>
      </Card>
    </section>
  );
}

function MyReports() {
  const t = useTranslations('report');
  const format = useFormatter();
  const reports = useMyReports();
  const { remove } = useReportMutations();
  if (!reports.data) return <Skeleton className="h-24 w-full" />;
  if (reports.data.length === 0) return null;
  return (
    <section aria-labelledby="r-mine" className="flex flex-col gap-3">
      <SectionTitle id="r-mine">{t('mine')}</SectionTitle>
      <ul className="flex flex-col gap-3">
        {reports.data.map((r: ReportDto) => (
          <li key={r.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-[0.8125rem] text-text-muted">
                    {t(`kinds.${r.kind}`)} ·{' '}
                    {format.dateTime(new Date(r.createdAt), { dateStyle: 'medium' })} ·{' '}
                    <StatusBadge status={r.status} />
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('withdraw', { title: r.title })}
                  onClick={() => {
                    if (confirm(t('withdrawConfirm'))) remove.mutate(r.id);
                  }}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
              {r.reply && (
                <div className="rounded-md bg-surface-muted p-3 text-[0.9375rem]">
                  <p className="text-[0.8125rem] font-medium text-text-muted">{t('reply')}</p>
                  <p className="whitespace-pre-line">{r.reply}</p>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <p className="text-[0.8125rem] text-text-muted">{t('retention')}</p>
    </section>
  );
}

export function StatusBadge({ status }: { status: ReportDto['status'] }) {
  const t = useTranslations('report');
  return <span className="font-medium text-text">{t(`statuses.${status}`)}</span>;
}
