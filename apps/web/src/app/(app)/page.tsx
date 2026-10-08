'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import { CalendarCheck, ShoppingCart, Sun, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Balance } from '@/components/app/balance';
import { AbsenceBanner } from '@/components/app/absences';
import { ReviewBanner } from '@/components/app/review-banner';
import { SwapBanner } from '@/components/app/swaps';
import { CalendarBanner } from '@/components/app/calendar-banner';
import { useSession } from '@/components/app/household-context';
import { NotificationBell } from '@/components/app/notification-bell';
import { QuickAdd } from '@/components/app/quick-add';
import { ApplyTemplateButton } from '@/components/app/templates';
import { TaskList } from '@/components/app/task-row';
import { useTaskDialog } from '@/components/app/use-task-dialog';
import { SectionTitle } from '@/components/ui/card';
import { Confetti } from '@/components/ui/confetti';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { api, errorKey } from '@/lib/api';
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
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">
            {t('greeting', { name: member?.displayName ?? me.displayName })}
          </h1>
          <NotificationBell className="mt-1 shrink-0" />
        </div>

        {party > 0 && <Confetti key={party} />}
        <CalendarBanner />
        <AbsenceBanner />
        <ReviewBanner />
        <SwapBanner />

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
              <EmptyState icon={Sun} title={t('emptyTitle')} body={t('emptyBody')} />
            </div>
          ) : (
            <TaskList items={todayItems} onOpen={dialog.openEdit} label={t('sectionToday')} />
          )}
        </section>

        {dueThisWeek.length > 0 && (
          <section aria-labelledby="due-heading" className="flex flex-col gap-3">
            <SectionTitle id="due-heading">{t('sectionDue')}</SectionTitle>
            <TaskList items={dueThisWeek} onOpen={dialog.openEdit} label={t('sectionDue')} />
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
                  <TaskList items={items} onOpen={dialog.openEdit} label={dayLabel(date, 'long')} />
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

/** Grand écran seulement : courses à acheter et budget commun du mois, d'un coup d'œil. */
function GlanceCards() {
  const t = useTranslations('today');
  const { household } = useSession();
  const today = useToday();
  const shopping = useShopping(household.id);
  const summary = useExpenseSummary(household.id, today.slice(0, 7));
  const money = useMoney();
  const toBuy = (shopping.data ?? []).filter((i) => !i.done).length;
  const s = summary.data;
  return (
    <div className="hidden flex-col gap-3 xl:flex">
      <Link
        href="/shopping"
        className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:bg-surface-muted"
      >
        <ShoppingCart aria-hidden className="size-5 text-text-muted" />
        <span className="flex flex-col">
          <span className="font-medium">{t('glanceShopping')}</span>
          <span className="text-[0.8125rem] text-text-muted">
            {t('glanceShoppingCount', { count: toBuy })}
          </span>
        </span>
      </Link>
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
