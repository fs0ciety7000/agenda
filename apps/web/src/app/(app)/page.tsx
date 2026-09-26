'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import { CalendarCheck, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Balance } from '@/components/app/balance';
import { useSession } from '@/components/app/household-context';
import { QuickAdd } from '@/components/app/quick-add';
import { TaskList } from '@/components/app/task-row';
import { useTaskDialog } from '@/components/app/use-task-dialog';
import { SectionTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { errorKey } from '@/lib/api';
import { addDays, useDayLabel, useToday } from '@/lib/format';
import { useOccurrences } from '@/lib/tasks';

/** Dashboard : ouvrir → voir ce qu'il y a à faire aujourd'hui → cocher → passer à autre chose. */
export default function TodayPage() {
  const t = useTranslations('today');
  const te = useTranslations('errors');
  const { me, household } = useSession();
  const member = household.members.find((m) => m.userId === me.id);
  const today = useToday();
  const dayLabel = useDayLabel();
  const dialog = useTaskDialog();

  const todayQ = useOccurrences(household.id, { view: 'today' });
  const overdueQ = useOccurrences(household.id, { view: 'overdue' });
  const weekQ = useOccurrences(household.id, { view: 'upcoming', to: addDays(today, 6) });

  // À faire d'abord, terminées ensuite.
  const todayItems = [...(todayQ.data ?? [])].sort(
    (a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE'),
  );
  const weekByDay = groupByDate(weekQ.data ?? []);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">
        {t('greeting', { name: member?.displayName ?? me.displayName })}
      </h1>

      <QuickAdd onMoreOptions={dialog.openNew} />

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

      <section aria-labelledby="balance-heading" className="flex flex-col gap-3">
        <SectionTitle id="balance-heading">{t('sectionBalance')}</SectionTitle>
        <div className="rounded-lg border border-border bg-surface p-4">
          <Balance />
        </div>
      </section>

      {dialog.dialog}
    </div>
  );
}

function groupByDate(items: OccurrenceDto[]): [string, OccurrenceDto[]][] {
  const map = new Map<string, OccurrenceDto[]>();
  for (const o of items) if (o.date) map.set(o.date, [...(map.get(o.date) ?? []), o]);
  return [...map.entries()];
}
