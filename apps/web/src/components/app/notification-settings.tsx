'use client';

import type { NotificationKind, NotificationPreferenceDto } from '@agenda/contracts';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/states';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/lib/notifications';
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
    </div>
  );
}
