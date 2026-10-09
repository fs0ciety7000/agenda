'use client';

import type { ImportantDateDto, ImportantDateKind } from '@agenda/contracts';
import { Bell, CalendarDays, Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { DateKindIcon } from '@/components/app/upcoming-dates';
import { useSession } from '@/components/app/household-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import { useOnline } from '@/lib/offline';
import { useImportantDateActions, useImportantDates } from '@/lib/important-dates';

const KINDS: ImportantDateKind[] = ['BIRTHDAY', 'ANNIVERSARY', 'MAINTENANCE', 'OTHER'];
const REMINDERS = [0, 1, 3, 7, 14, 30];

type Draft = {
  id?: string;
  title: string;
  kind: ImportantDateKind;
  month: number;
  day: number;
  year: string;
  repeatsYearly: boolean;
  remindDaysBefore: number;
};

/** Dates importantes du foyer : anniversaires, fêtes, entretiens annuels, rappelés à l'avance. */
export default function ImportantDatesPage() {
  const t = useTranslations('importantDates');
  const te = useTranslations('errors');
  const toast = useToast();
  const format = useFormatter();
  const { household } = useSession();
  const dates = useImportantDates(household.id);
  const actions = useImportantDateActions(household.id);
  const online = useOnline();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [yearError, setYearError] = useState(false);

  const fail = (e: unknown) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' });
  const open = (d: ImportantDateDto | null) => {
    setYearError(false);
    const now = new Date();
    setDraft(
      d
        ? { ...d, id: d.id, year: d.year ? String(d.year) : '' }
        : {
            title: '',
            kind: 'BIRTHDAY',
            month: now.getMonth() + 1,
            day: now.getDate(),
            year: '',
            repeatsYearly: true,
            remindDaysBefore: 7,
          },
    );
  };
  const monthName = (m: number) =>
    format.dateTime(new Date(Date.UTC(2024, m - 1, 15)), { month: 'long', timeZone: 'UTC' });

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const year = draft.year.trim() ? Number(draft.year) : null;
    if (!draft.repeatsYearly && year == null) {
      setYearError(true);
      document.getElementById('date-year')?.focus();
      return;
    }
    actions.save.mutate(
      {
        id: draft.id,
        input: {
          title: draft.title,
          kind: draft.kind,
          month: draft.month,
          day: draft.day,
          year,
          repeatsYearly: draft.repeatsYearly,
          remindDaysBefore: draft.remindDaysBefore,
        },
      },
      {
        onSuccess: () => {
          setDraft(null);
          toast({ message: t(draft.id ? 'saved' : 'created') });
        },
        onError: fail,
      },
    );
  };
  const remove = (id: string, title: string) =>
    actions.remove.mutate(id, {
      onSuccess: () => {
        setDraft(null);
        toast({ message: t('deleted', { title }) });
      },
      onError: fail,
    });

  const list = dates.data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{t('title')}</h1>
        {list.length > 0 && (
          <Button onClick={() => open(null)} disabled={!online}>
            <Plus aria-hidden className="size-4" />
            {t('new')}
          </Button>
        )}
      </div>
      <p className="-mt-3 text-[0.9375rem] text-text-muted">{t('intro')}</p>
      {!online && <p className="text-sm text-text-muted">{t('offline')}</p>}

      {dates.error ? (
        <ErrorState
          message={te(errorKey(dates.error) as 'generic')}
          retryLabel={te('retry')}
          onRetry={() => void dates.refetch()}
        />
      ) : !dates.data ? (
        <Skeleton className="h-40 w-full" />
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={CalendarDays}
            illustration="dates"
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={
              <Button onClick={() => open(null)} disabled={!online}>
                <Plus aria-hidden className="size-4" />
                {t('new')}
              </Button>
            }
          />
        </div>
      ) : (
        <ul
          aria-label={t('title')}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {list.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                disabled={!online}
                onClick={() => open(d)}
                className="flex w-full min-h-14 items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted disabled:hover:bg-transparent"
              >
                <DateKindIcon kind={d.kind} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="break-words font-medium">{d.title}</span>
                  <span className="text-[0.8125rem] text-text-muted">
                    {d.nextDate
                      ? [
                          format.dateTime(new Date(`${d.nextDate}T12:00:00Z`), {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            timeZone: 'UTC',
                          }),
                          t('when', { days: d.daysLeft ?? 0 }),
                          d.years != null && d.kind !== 'MAINTENANCE'
                            ? t('years', { years: d.years })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : t('past')}
                  </span>
                </span>
                {d.nextDate && (
                  <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] text-text-muted">
                    <Bell aria-hidden className="size-3.5" />
                    {t('remindShort', { days: d.remindDaysBefore })}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        {draft && (
          <DialogContent title={t(draft.id ? 'edit' : 'new')} closeLabel={t('close')}>
            <form onSubmit={save} className="flex flex-col gap-4" noValidate>
              <Field
                label={t('fieldTitle')}
                value={draft.title}
                maxLength={120}
                required
                placeholder={t('titlePlaceholder')}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <Select
                label={t('fieldKind')}
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as ImportantDateKind })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind.${k}`)}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-[5rem_1fr] gap-3">
                <Select
                  label={t('fieldDay')}
                  value={draft.day}
                  onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
                <Select
                  label={t('fieldMonth')}
                  value={draft.month}
                  onChange={(e) => setDraft({ ...draft, month: Number(e.target.value) })}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {monthName(m)}
                    </option>
                  ))}
                </Select>
              </div>
              <Field
                id="date-year"
                label={t(draft.repeatsYearly ? 'fieldYearOptional' : 'fieldYear')}
                inputMode="numeric"
                maxLength={4}
                value={draft.year}
                hint={draft.repeatsYearly ? t('yearHint') : undefined}
                error={yearError ? t('yearRequired') : undefined}
                onChange={(e) => {
                  setYearError(false);
                  setDraft({ ...draft, year: e.target.value.replace(/\D/g, '') });
                }}
              />
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem]">
                <input
                  type="checkbox"
                  checked={draft.repeatsYearly}
                  onChange={(e) => setDraft({ ...draft, repeatsYearly: e.target.checked })}
                  className="size-5 accent-(--color-accent)"
                />
                {t('fieldRepeats')}
              </label>
              <Select
                label={t('fieldReminder')}
                value={draft.remindDaysBefore}
                onChange={(e) => setDraft({ ...draft, remindDaysBefore: Number(e.target.value) })}
              >
                {REMINDERS.map((n) => (
                  <option key={n} value={n}>
                    {t('remind', { days: n })}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap justify-between gap-2">
                {draft.id ? (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => remove(draft.id!, draft.title)}
                    loading={actions.remove.isPending}
                  >
                    {t('delete')}
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="submit"
                  disabled={!draft.title.trim() || !online}
                  loading={actions.save.isPending}
                >
                  {t(draft.id ? 'save' : 'add')}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
