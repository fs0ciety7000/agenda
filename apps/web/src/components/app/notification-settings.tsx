'use client';

import type { NotificationKind, NotificationPreferenceDto } from '@agenda/contracts';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import {
  useNotificationPreferences,
  usePushStatus,
  useUpdateNotificationPreferences,
} from '@/lib/notifications';
import { useWebPush } from '@/lib/web-push';
import { useSession } from './household-context';

/** Préférences par type : dans l'app (cloche) et sur le téléphone (app Android). */
export function NotificationSettings() {
  const t = useTranslations('notificationSettings');
  const { household } = useSession();
  const prefs = useNotificationPreferences(household.id);
  const update = useUpdateNotificationPreferences(household.id);
  if (!prefs.data) return <Skeleton className="h-24 w-full" />;

  const set = (type: NotificationKind, patch: Partial<NotificationPreferenceDto>) => {
    const current = prefs.data!.find((p) => p.type === type)!;
    update.mutate([{ ...current, ...patch }]);
  };

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-left text-[0.9375rem]">
        <caption className="sr-only">{t('title')}</caption>
        <thead>
          <tr className="text-[0.8125rem] text-text-muted">
            <th scope="col" className="pb-2 font-normal" />
            <th scope="col" className="w-24 pb-2 text-center font-normal">
              {t('inApp')}
            </th>
            <th scope="col" className="w-24 pb-2 text-center font-normal">
              {t('push')}
            </th>
          </tr>
        </thead>
        <tbody>
          {prefs.data.map((p) => (
            <tr key={p.type} className="border-t border-border">
              <th scope="row" className="py-3 pr-3 font-normal">
                {t(`types.${p.type}`)}
              </th>
              {(['inApp', 'push'] as const).map((channel) => (
                <td key={channel} className="py-3 text-center">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-accent)]"
                    checked={p[channel]}
                    onChange={(e) => set(p.type, { [channel]: e.target.checked })}
                    aria-label={`${t(`types.${p.type}`)} — ${t(channel)}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[0.8125rem] text-text-muted">{t('hint')}</p>
      <BrowserNotifications />
      <PushStatus />
    </div>
  );
}

/** « Sur le téléphone » : état réel de l'envoi instantané, pour savoir quoi corriger. */
function PushStatus() {
  const t = useTranslations('notificationSettings.status');
  const status = usePushStatus();
  const format = useFormatter();
  if (!status.data) return null;
  const { serverEnabled, serverIssue, devices, lastRegisteredAt } = status.data;
  const ok = serverEnabled && devices > 0;
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2.5 text-[0.875rem]',
        ok ? 'border-success/40 bg-success/10' : 'border-border bg-surface-muted',
      )}
    >
      <p className="font-medium">{t(ok ? 'ok' : 'title')}</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-text-muted">
        <li>
          {t(
            serverEnabled
              ? 'server'
              : serverIssue === 'INVALID_CONFIG'
                ? 'serverInvalid'
                : 'serverOff',
          )}
        </li>
        <li>
          {devices > 0 && lastRegisteredAt
            ? t('devices', {
                count: devices,
                date: format.relativeTime(new Date(lastRegisteredAt)),
              })
            : t('noDevice')}
        </li>
      </ul>
    </div>
  );
}

/** Notifications du site sur ce navigateur (Web Push), en plus de l'app Android. */
function BrowserNotifications() {
  const t = useTranslations('notificationSettings.browser');
  const { state, busy, enable, disable } = useWebPush();
  if (state === 'loading' || state === 'server-off') return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
      <p className="text-[0.875rem]">
        {state === 'on'
          ? t('on')
          : state === 'denied'
            ? t('denied')
            : state === 'unsupported'
              ? t('unsupported')
              : t('off')}
      </p>
      {state === 'off' && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void enable()}>
          {t('enable')}
        </Button>
      )}
      {state === 'on' && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disable()}>
          {t('disable')}
        </Button>
      )}
    </div>
  );
}
