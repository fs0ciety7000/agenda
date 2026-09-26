'use client';

import type { CalendarStatusDto } from '@agenda/contracts';
import { AlertTriangle, CalendarCheck, CalendarDays, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import {
  connectUrl,
  useAvailableCalendars,
  useCalendarMutations,
  useCalendarStatus,
} from '@/lib/calendar';
import { cn } from '@/lib/cn';
import { useSession } from './household-context';

/** Message humain pour une erreur de synchronisation (jamais d'erreur technique brute). */
export function useCalendarErrorText() {
  const t = useTranslations('calendarSync.errors');
  return (code: string | null | undefined, calendar: string) =>
    code &&
    [
      'CALENDAR_READ_ONLY',
      'CALENDAR_NOT_FOUND',
      'GOOGLE_REVOKED',
      'CALENDAR_RATE_LIMITED',
      'CALENDAR_UNAVAILABLE',
    ].includes(code)
      ? t(code as 'GOOGLE_REVOKED', { calendar })
      : t('CALENDAR_UNAVAILABLE', { calendar });
}

/**
 * Réglages « Calendrier partagé » :
 * 1. connecter Google Calendar ; 2. choisir « Commun G & N » ; 3. vérifier l'état de la synchro.
 */
/** Codes renvoyés par le retour d'autorisation Google (`?calendarError=…`), chacun avec son message. */
const CALLBACK_ERRORS = [
  'CALENDAR_NOT_CONFIGURED',
  'GOOGLE_FLOW_EXPIRED',
  'GOOGLE_DENIED',
  'GOOGLE_SCOPES_MISSING',
];

export function CalendarSettings() {
  const t = useTranslations('calendarSync');
  const te = useTranslations('errors');
  const format = useFormatter();
  const { household } = useSession();
  const status = useCalendarStatus(household.id);
  const { link, unlink, syncNow, disconnect } = useCalendarMutations(household.id);
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const errorText = useCalendarErrorText();
  const [picking, setPicking] = useState(false);

  // Retour de l'autorisation Google (?calendar=connected / ?calendarError=…).
  useEffect(() => {
    if (params.get('calendar') === 'connected') toast({ message: t('connectedToast') });
    const err = params.get('calendarError');
    if (err)
      toast({
        message: te(
          (CALLBACK_ERRORS.includes(err) ? err : 'GOOGLE_CALENDAR_FAILED') as 'GOOGLE_FAILED',
        ),
        tone: 'error',
      });
    if (params.get('calendar') || err) router.replace('/settings', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = status.data;
  const canPick = Boolean(
    s?.connection && s.connection.status === 'ACTIVE' && (!s.link || picking),
  );
  const onError = (e: unknown) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' });

  if (!s) return <Skeleton className="h-24 w-full" />;
  if (!s.configured) {
    return (
      <p className="flex items-center gap-3 text-[0.9375rem] text-text-muted">
        <CalendarDays aria-hidden className="size-5 shrink-0 stroke-[1.5]" />
        {t('notConfigured')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {s.link && !picking && <LinkedCalendar status={s} errorText={errorText} />}

      {s.link && !picking && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={syncNow.isPending}
            onClick={() =>
              syncNow.mutate(undefined, {
                onSuccess: () => toast({ message: t('syncStarted') }),
                onError,
              })
            }
          >
            <RefreshCw aria-hidden className="size-4" />
            {t('syncNow')}
          </Button>
          {s.connection?.status === 'ACTIVE' && (
            <Button variant="ghost" size="sm" onClick={() => setPicking(true)}>
              {t('change')}
            </Button>
          )}
          {(s.link.errorCode === 'GOOGLE_REVOKED' || !s.connection) && (
            <Button asChild variant="secondary" size="sm">
              <a href={connectUrl()}>{t('reconnect')}</a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            loading={unlink.isPending}
            onClick={() => {
              if (window.confirm(t('unlinkConfirm', { calendar: s.link!.summary })))
                unlink.mutate(true, { onError });
            }}
          >
            {t('unlink')}
          </Button>
        </div>
      )}

      {!s.link && !s.connection && (
        <div className="flex flex-col gap-3">
          <p className="text-[0.9375rem] text-text-muted">{t('intro')}</p>
          <Button asChild className="self-start">
            <a href={connectUrl()}>
              <CalendarDays aria-hidden className="size-4" />
              {t('connect')}
            </a>
          </Button>
          <p className="text-[0.8125rem] text-text-muted">{t('privacyNote')}</p>
        </div>
      )}

      {!s.link && s.connection?.status === 'REVOKED' && (
        <Button asChild variant="secondary" className="self-start">
          <a href={connectUrl()}>{t('reconnect')}</a>
        </Button>
      )}

      {canPick && (
        <CalendarPicker
          currentId={s.link?.calendarId}
          busy={link.isPending}
          onCancel={s.link ? () => setPicking(false) : undefined}
          onPick={(id) =>
            link.mutate(id, {
              onSuccess: () => {
                setPicking(false);
                toast({ message: t('linkedToast') });
              },
              onError,
            })
          }
        />
      )}

      {s.connection && (
        <p className="flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-text-muted">
          {t('myAccount', { email: s.connection.email })}
          <button
            type="button"
            className="underline-offset-4 hover:text-text hover:underline"
            onClick={() => {
              if (window.confirm(t('disconnectConfirm'))) disconnect.mutate(undefined, { onError });
            }}
          >
            {t('disconnect')}
          </button>
        </p>
      )}
      {s.link?.lastReconciledAt && (
        <p className="text-[0.75rem] text-text-muted">
          {t('lastCheck', { date: format.relativeTime(new Date(s.link.lastReconciledAt)) })}
        </p>
      )}
    </div>
  );
}

function LinkedCalendar({
  status: s,
  errorText,
}: {
  status: CalendarStatusDto;
  errorText: (code: string | null, calendar: string) => string;
}) {
  const t = useTranslations('calendarSync');
  const link = s.link!;
  const ok = link.status === 'ACTIVE';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {ok ? (
          <CalendarCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
        ) : (
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
        )}
        <div>
          <p className="text-[0.9375rem] font-medium">✓ {link.summary}</p>
          <p className="text-[0.8125rem] text-text-muted">
            {ok ? t('connected') : t('interrupted')} ·{' '}
            {t('via', { email: link.connectionEmail, name: link.connectedBy ?? '—' })}
          </p>
        </div>
      </div>
      {!ok && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorText(link.errorCode, link.summary)}
        </p>
      )}
      {ok && (
        <p className="text-[0.8125rem] text-text-muted">
          {t('stats', { synced: s.stats.synced, pending: s.stats.pending, errors: s.stats.errors })}
        </p>
      )}
    </div>
  );
}

function CalendarPicker({
  currentId,
  busy,
  onPick,
  onCancel,
}: {
  currentId?: string;
  busy: boolean;
  onPick: (id: string) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('calendarSync');
  const te = useTranslations('errors');
  const { household } = useSession();
  const calendars = useAvailableCalendars(household.id, true);
  const [selected, setSelected] = useState<string | null>(currentId ?? null);

  // Pré-sélection du calendrier commun s'il existe (« Commun G & N »).
  useEffect(() => {
    if (selected || !calendars.data) return;
    const common = calendars.data.find((c) => c.writable && /commun|g\s*&\s*n/i.test(c.summary));
    if (common) setSelected(common.id);
  }, [calendars.data, selected]);

  if (calendars.error)
    return <p className="text-sm text-danger">{te(errorKey(calendars.error) as 'generic')}</p>;
  if (!calendars.data) return <Skeleton className="h-32 w-full" />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{t('pickTitle')}</p>
      <div role="radiogroup" aria-label={t('pickTitle')} className="flex flex-col gap-2">
        {calendars.data.map((c) => (
          <label
            key={c.id}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-[0.9375rem]',
              c.writable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
              selected === c.id ? 'border-accent bg-accent/5' : 'border-border',
            )}
          >
            <input
              type="radio"
              name="calendar"
              value={c.id}
              disabled={!c.writable}
              checked={selected === c.id}
              onChange={() => setSelected(c.id)}
              className="size-4 accent-(--color-accent)"
            />
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full"
              style={{ background: c.color ?? 'var(--color-text-muted)' }}
            />
            <span className="flex-1">
              {c.summary}
              {!c.writable && (
                <span className="block text-[0.8125rem] text-text-muted">{t('readOnly')}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      <p className="text-[0.8125rem] text-text-muted">{t('notListed')}</p>
      <div className="flex gap-2">
        <Button disabled={!selected} loading={busy} onClick={() => selected && onPick(selected)}>
          {t('useCalendar')}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}
