'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import { CalendarCheck, ShoppingBasket, Sun, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Balance } from '@/components/app/balance';
import { AbsenceBanner } from '@/components/app/absences';
import { ReviewBanner } from '@/components/app/review-banner';
import { SwapBanner } from '@/components/app/swaps';
import { CalendarBanner } from '@/components/app/calendar-banner';
import { useSession } from '@/components/app/household-context';
import { MemberAvatar } from '@/components/app/member-avatar';
import { NotificationBell } from '@/components/app/notification-bell';
import { QuickAdd } from '@/components/app/quick-add';
import { ApplyTemplateButton } from '@/components/app/templates';
import { TaskList } from '@/components/app/task-row';
import { UpcomingDates } from '@/components/app/upcoming-dates';
import { WeekBoard } from '@/components/app/week-board';
import { useTaskDialog } from '@/components/app/use-task-dialog';
import { SectionTitle } from '@/components/ui/card';
import { Confetti } from '@/components/ui/confetti';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { api, errorKey } from '@/lib/api';
import { cn } from '@/lib/cn';
import { addDays, useDayLabel, useToday } from '@/lib/format';
import { useExpenseSummary, useMoney } from '@/lib/expenses';
import { useShopping } from '@/lib/shopping';
import { useOccurrences } from '@/lib/tasks';
import { endOfWeek } from '@agenda/domain';

/** Dashboard : ouvrir → voir ce qu'il y a à faire aujourd'hui → cocher → passer à autre chose. */
export default function TodayPage() {
  const t = useTranslations('today');
  const toast = useToast();
  const te = useTranslations('errors');
  const { me, household } = useSession();
  const member = household.members.find((m) => m.userId === me.id);
  const today = useToday();
  const dayLabel = useDayLabel();
  const dialog = useTaskDialog();
  const params = useSearchParams();
  const router = useRouter();

  // Ouverture depuis une notification (/?open=<occurrence>).
  const openId = params.get('open');
  useEffect(() => {
    if (!openId) return;
    router.replace('/', { scroll: false });
    api<OccurrenceDto>(`/v1/households/${household.id}/occurrences/${openId}`)
      .then(dialog.openEdit)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const todayQ = useOccurrences(household.id, { view: 'today' });
  const overdueQ = useOccurrences(household.id, { view: 'overdue' });
  const weekQ = useOccurrences(household.id, { view: 'upcoming', to: addDays(today, 6) });
  const unscheduledQ = useOccurrences(household.id, { view: 'unscheduled' });
  // Sans date, à faire d'ici dimanche (les échéances dépassées sont « À rattraper »).
  const dueThisWeek = (unscheduledQ.data ?? []).filter(
    (o) => o.dueDate && o.dueDate >= today && o.dueDate <= endOfWeek(today),
  );

  // À faire d'abord, terminées ensuite.
  const todayItems = [...(todayQ.data ?? [])].sort(
    (a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE'),
  );
  const weekByDay = groupByDate(weekQ.data ?? []);
  const left = todayItems.filter((o) => o.status !== 'DONE').length;
  const format = useFormatter();
  const longDate = format.dateTime(new Date(`${today}T12:00:00Z`), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Tout est fait pour aujourd'hui : confettis (seulement au moment où ça arrive).
  const allDone = todayItems.length > 0 && todayItems.every((o) => o.status === 'DONE');
  const wasAllDone = useRef<boolean | null>(null);
  const [party, setParty] = useState(0);
  useEffect(() => {
    if (!todayQ.data) return;
    if (wasAllDone.current === false && allDone) {
      setParty(Date.now());
      toast({ message: t('allDone') });
    }
    wasAllDone.current = allDone;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, todayQ.data]);

  return (
    // Grand écran : la liste à gauche, et à droite ce qu'on consulte d'un coup d'œil.
    <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start xl:gap-10">
      <div className="flex min-w-0 flex-col gap-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em]">
              {t('greeting', { name: member?.displayName ?? me.displayName })}
            </h1>
            {todayQ.data && (
              <p className="text-text-muted first-letter:uppercase">
                {todayItems.length === 0
                  ? t('summaryNone', { date: longDate })
                  : t('summaryLeft', { date: longDate, count: left })}
              </p>
            )}
          </div>
          <NotificationBell className="mt-1 shrink-0" />
        </div>

        {party > 0 && <Confetti key={party} />}
        <CalendarBanner />
        <AbsenceBanner />
        <ReviewBanner />
        <SwapBanner />

        <ShoppingLive />

        <QuickAdd onMoreOptions={dialog.openNew} extra={<ApplyTemplateButton />} />

        {(overdueQ.data?.length ?? 0) > 0 && (
          <section aria-labelledby="overdue-heading" className="flex flex-col gap-3">
            <SectionTitle id="overdue-heading">
              {t('sectionOverdue', { count: overdueQ.data!.length })}
            </SectionTitle>
            <TaskList
              items={overdueQ.data!}
              onOpen={dialog.openEdit}
              showDate
              flat
              label={t('sectionOverdue', { count: overdueQ.data!.length })}
            />
          </section>
        )}

        <section aria-labelledby="today-heading" className="flex flex-col gap-3">
          <SectionTitle id="today-heading">{t('sectionToday')}</SectionTitle>
          {todayQ.error ? (
            <ErrorState
              message={te(errorKey(todayQ.error) as 'generic')}
              retryLabel={te('retry')}
              onRetry={() => void todayQ.refetch()}
            />
          ) : !todayQ.data ? (
            <Skeleton className="h-32 w-full" />
          ) : todayItems.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <EmptyState
                icon={Sun}
                illustration="today"
                title={t('emptyTitle')}
                body={t('emptyBody')}
              />
            </div>
          ) : (
            <TaskList items={todayItems} onOpen={dialog.openEdit} flat label={t('sectionToday')} />
          )}
        </section>

        <UpcomingDates />

        {todayQ.data && weekQ.data && (
          <WeekBoard
            items={[...todayQ.data, ...weekQ.data]}
            today={today}
            onOpen={dialog.openEdit}
          />
        )}

        {dueThisWeek.length > 0 && (
          <section aria-labelledby="due-heading" className="flex flex-col gap-3">
            <SectionTitle id="due-heading">{t('sectionDue')}</SectionTitle>
            <TaskList items={dueThisWeek} onOpen={dialog.openEdit} flat label={t('sectionDue')} />
          </section>
        )}

        <section aria-labelledby="week-heading" className="flex flex-col gap-3">
          <SectionTitle id="week-heading">{t('sectionWeek')}</SectionTitle>
          {!weekQ.data ? (
            <Skeleton className="h-24 w-full" />
          ) : weekByDay.length === 0 ? (
            <p className="flex items-center gap-2 text-[0.9375rem] text-text-muted">
              <CalendarCheck aria-hidden className="size-4" />
              {t('weekEmpty')}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {weekByDay.map(([date, items]) => (
                <div key={date} className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium first-letter:uppercase">
                    {dayLabel(date, 'long')}
                  </h3>
                  <TaskList
                    items={items}
                    onOpen={dialog.openEdit}
                    flat
                    label={dayLabel(date, 'long')}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-8 xl:sticky xl:top-8">
        <section aria-labelledby="balance-heading" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <SectionTitle id="balance-heading">{t('sectionBalance')}</SectionTitle>
            <Link href="/stats" className="text-sm text-accent hover:underline">
              {t('seeStats')}
            </Link>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <Balance />
          </div>
        </section>
        <GlanceCards />
      </aside>

      {dialog.dialog}
    </div>
  );
}

function groupByDate(items: OccurrenceDto[]): [string, OccurrenceDto[]][] {
  const map = new Map<string, OccurrenceDto[]>();
  for (const o of items) if (o.date) map.set(o.date, [...(map.get(o.date) ?? []), o]);
  return [...map.entries()];
}

/** Grand écran seulement : budget commun du mois, d'un coup d'œil. */
function GlanceCards() {
  const t = useTranslations('today');
  const { household } = useSession();
  const today = useToday();
  const summary = useExpenseSummary(household.id, today.slice(0, 7));
  const money = useMoney();
  const s = summary.data;
  return (
    <div className="hidden flex-col gap-3 xl:flex">
      <Link
        href="/expenses"
        className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:bg-surface-muted"
      >
        <Wallet aria-hidden className="size-5 text-text-muted" />
        <span className="flex flex-col">
          <span className="font-medium">{t('glanceExpenses')}</span>
          <span className="text-[0.8125rem] tabular-nums text-text-muted">
            {!s
              ? '…'
              : s.budgetCents
                ? t('glanceBudget', { spent: money(s.commonCents), budget: money(s.budgetCents) })
                : t('glanceCommon', { amount: money(s.commonCents) })}
          </span>
        </span>
      </Link>
    </div>
  );
}

/** Un article coché il y a moins de 30 min : quelqu'un est au magasin. */
const LIVE_MS = 30 * 60_000;
/** Au-delà, une barre continue plutôt qu'un segment par article. */
const MAX_SEGMENTS = 12;

/**
 * Carte « courses en direct » : qui fait les courses et où il en est, ou simplement ce qu'il
 * reste à acheter. Rien tant que la liste est vide.
 */
function ShoppingLive() {
  const t = useTranslations('today');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { me, household } = useSession();
  const shopping = useShopping(household.id);
  const items = shopping.data ?? [];
  const done = items.filter((i) => i.done);
  const total = items.length;
  const last = done.filter((i) => i.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!))[0];
  const live = last && now.getTime() - new Date(last.doneAt!).getTime() < LIVE_MS ? last : null;
  const shopper = live ? household.members.find((m) => m.id === live.doneById) : undefined;
  if (total === 0 || (!live && done.length === total)) return null;

  const progress = t('shoppingProgress', { done: done.length, total });
  return (
    <Link
      href="/shopping"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-raised transition-colors hover:bg-surface-muted"
    >
      <span className="flex items-center gap-3">
        {shopper ? (
          <MemberAvatar member={shopper} size="lg" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-muted">
            <ShoppingBasket aria-hidden className="size-5 text-text" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">
            {!live
              ? t('glanceShopping')
              : shopper && shopper.userId !== me.id
                ? t('shoppingLive', { name: shopper.displayName })
                : t('shoppingLiveMe')}
          </span>
          {live ? (
            <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-success">
              <span aria-hidden className="size-2 rounded-full bg-success" />
              {t('shoppingLiveSince', {
                time: format.relativeTime(new Date(live.doneAt!), now),
              })}
            </span>
          ) : (
            <span className="text-[0.8125rem] text-text-muted">
              {t('glanceShoppingCount', { count: total - done.length })}
            </span>
          )}
        </span>
        <span className="text-xl font-semibold tabular-nums" aria-hidden>
          {done.length}
          <span className="text-base font-normal text-text-muted"> / {total}</span>
        </span>
      </span>
      <span role="img" aria-label={progress} className="flex gap-1">
        {total <= MAX_SEGMENTS ? (
          items.map((_, i) => (
            <span
              key={i}
              className={cn('h-1.5 flex-1 rounded-full', i < done.length ? 'bg-text' : 'bg-border')}
            />
          ))
        ) : (
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <span
              className="block h-full rounded-full bg-text"
              style={{ width: `${(done.length / total) * 100}%` }}
            />
          </span>
        )}
      </span>
    </Link>
  );
}
