'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCalendarStatus } from '@/lib/calendar';
import { useCalendarErrorText } from './calendar-settings';
import { useSession } from './household-context';

/** Synchronisation interrompue : message compréhensible + lien vers les Réglages. */
export function CalendarBanner() {
  const t = useTranslations('calendarSync');
  const { household } = useSession();
  const status = useCalendarStatus(household.id);
  const errorText = useCalendarErrorText();
  const link = status.data?.link;
  if (!link || link.status === 'ACTIVE') return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3"
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
      <div className="flex flex-col gap-1 text-sm">
        <p>{errorText(link.errorCode, link.summary)}</p>
        <Link
          href="/settings"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {t('fix')}
        </Link>
      </div>
    </div>
  );
}
