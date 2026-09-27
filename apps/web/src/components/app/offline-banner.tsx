'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useOnline, usePendingChanges } from '@/lib/offline';

/** Hors ligne : ce qui est affiché, et ce qui attend d'être envoyé. */
export function OfflineBanner() {
  const t = useTranslations('offline');
  const online = useOnline();
  const pending = usePendingChanges();
  if (online && pending === 0) return null;
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3 text-[0.9375rem]"
    >
      {online ? (
        <RefreshCw aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin" />
      ) : (
        <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0" />
      )}
      <p>
        {online ? t('sending', { count: pending }) : t('offline')}
        {!online && pending > 0 && <> {t('pending', { count: pending })}</>}
      </p>
    </div>
  );
}
