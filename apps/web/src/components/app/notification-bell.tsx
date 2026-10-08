'use client';

import type { NotificationDto } from '@agenda/contracts';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { useMoney } from '@/lib/expenses';
import { useMarkNotificationsRead, useNotifications } from '@/lib/notifications';
import { useSession } from './household-context';

/** Cloche : nombre de non lues, liste ; toucher une notification ouvre la tâche. */
export function NotificationBell({ className }: { className?: string }) {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const { household } = useSession();
  const list = useNotifications(household.id);
  const markRead = useMarkNotificationsRead(household.id);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = list.data?.unread ?? 0;
  const items = list.data?.items ?? [];

  const openItem = (n: NotificationDto) => {
    if (!n.readAt) markRead.mutate([n.id]);
    setOpen(false);
    if (n.occurrenceId) router.push(`/?open=${n.occurrenceId}`);
    else if (n.type === 'CALENDAR_SYNC_FAILED') router.push('/settings');
    else if (n.type === 'EXPENSE_BUDGET') router.push('/expenses');
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn('relative', className)}
        onClick={() => setOpen(true)}
        aria-label={unread ? t('bellUnread', { count: unread }) : t('bell')}
      >
        <Bell aria-hidden className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.6875rem] font-semibold leading-4 text-accent-fg"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('title')} closeLabel={tc('close')}>
          {items.length === 0 ? (
            <p className="text-[0.9375rem] text-text-muted">{t('empty')}</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationRow n={n} onOpen={() => openItem(n)} />
                </li>
              ))}
            </ul>
          )}
          {unread > 0 && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => markRead.mutate(undefined)}>
                {t('markAll')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function NotificationRow({ n, onOpen }: { n: NotificationDto; onOpen: () => void }) {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const money = useMoney();
  const text =
    n.type === 'EXPENSE_BUDGET'
      ? t('budget', {
          month: format.dateTime(new Date(`${n.month}-15T12:00:00`), { month: 'long' }),
          level: n.level ?? 80,
          amount: money(n.amountCents ?? 0),
          budget: money(n.budgetCents ?? 0),
        })
      : n.type === 'TASK_THANKS'
        ? n.title
          ? t('thanked', { by: n.byName ?? '?', title: n.title })
          : t('thankedDeleted', { by: n.byName ?? '?' })
        : n.type === 'TASK_COMMENT'
          ? n.title
            ? t('commented', { by: n.byName ?? '?', title: n.title })
            : t('commentedDeleted', { by: n.byName ?? '?' })
          : n.type === 'TASK_ASSIGNED'
            ? n.title
              ? t(n.recurring ? 'assignedRecurring' : 'assigned', {
                  by: n.byName ?? '?',
                  title: n.title,
                })
              : t('assignedDeleted', { by: n.byName ?? '?' })
            : t('calendarFailed');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-h-12 items-start gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface-muted"
    >
      <span
        aria-hidden
        className={cn(
          'mt-2 size-2 shrink-0 rounded-full',
          n.readAt ? 'bg-transparent' : 'bg-accent',
        )}
      />
      <span className="flex flex-col gap-0.5">
        <span className={cn('text-[0.9375rem]', !n.readAt && 'font-medium')}>
          {!n.readAt && <span className="sr-only">{t('unread')} : </span>}
          {text}
        </span>
        <span className="text-[0.8125rem] text-text-muted">
          {format.relativeTime(new Date(n.createdAt))}
          {n.date &&
            ` · ${format.dateTime(new Date(`${n.date}T12:00:00`), { weekday: 'short', day: 'numeric', month: 'short' })}`}
        </span>
      </span>
    </button>
  );
}
