'use client';

import type { OccurrenceDto, SeriesDto } from '@agenda/contracts';
import { Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { api } from '@/lib/api';
import { formatDuration, formatTime, useDayLabel } from '@/lib/format';
import { useSeriesList } from '@/lib/tasks';
import { useSession } from './household-context';
import { useRotationText, useRuleText } from './recurrence-text';

/** Onglet « Récurrentes » : une ligne par tâche récurrente, avec sa règle, sa rotation et la prochaine date. */
export function SeriesList({ onOpen }: { onOpen: (o: OccurrenceDto) => void }) {
  const t = useTranslations('tasksPage');
  const { household } = useSession();
  const series = useSeriesList(household.id);
  const ruleText = useRuleText();
  const rotationText = useRotationText(household);
  const dayLabel = useDayLabel();

  /** Ouvre la prochaine occurrence de la série dans le formulaire. */
  const open = async (s: SeriesDto) => {
    if (!s.nextDate) return;
    const list = await api<OccurrenceDto[]>(
      `/v1/households/${household.id}/occurrences?from=${s.nextDate}&to=${s.nextDate}&status=TODO`,
    );
    const occ = list.find((o) => o.seriesId === s.id);
    if (occ) onOpen(occ);
  };

  if (!series.data) return <Skeleton className="h-48 w-full" />;
  if (series.data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState icon={Repeat} title={t('noSeries')} body={t('noSeriesBody')} />
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {series.data.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => void open(s)}
            className="flex w-full flex-col gap-1 px-4 py-3 text-left"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[0.9375rem]">{s.title}</span>
              {s.nextDate && (
                <span className="shrink-0 text-[0.8125rem] text-text-muted">
                  {t('next', { date: dayLabel(s.nextDate) })}
                </span>
              )}
            </span>
            <span className="text-[0.8125rem] text-text-muted">
              <Repeat aria-hidden className="mr-1 inline size-3 align-[-1px]" />
              {ruleText(s.rule)}
              {s.startMinute != null && ` · ${formatTime(s.startMinute)}`}
              {s.durationMinutes ? ` · ${formatDuration(s.durationMinutes)}` : ''}
              {s.visibility === 'SHARED' && ` · ${rotationText(s.rotation)}`}
              {s.category && ` · ${s.category.emoji ?? ''} ${s.category.name}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
