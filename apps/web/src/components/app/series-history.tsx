'use client';

import { useTranslations } from 'next-intl';
import { useDayLabel } from '@/lib/format';
import { useSeriesHistory } from '@/lib/templates';
import { useSession } from './household-context';

/** « Fait par » d'une tâche récurrente : les dernières fois, et qui l'a faite combien de fois. */
export function SeriesHistory({ seriesId }: { seriesId: string }) {
  const t = useTranslations('history');
  const { household } = useSession();
  const history = useSeriesHistory(household.id, seriesId);
  const dayLabel = useDayLabel();
  const name = (id: string | null) =>
    household.members.find((m) => m.id === id)?.displayName ?? t('formerMember');

  const items = history.data?.items ?? [];
  if (!history.data || items.length === 0) return null;
  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t('title')}
        {history.data.doneBy.length > 0 && (
          <span className="ml-2 font-normal text-text-muted">
            {history.data.doneBy.map((d) => `${name(d.memberId)} ${d.count}`).join(' · ')}
          </span>
        )}
      </summary>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {items.map((i) => (
          <li key={i.occurrenceId} className="flex justify-between gap-3">
            <span className="first-letter:uppercase">
              {i.date ? dayLabel(i.date, 'long') : '—'}
            </span>
            <span className={i.status === 'DONE' ? 'text-text' : 'text-text-muted'}>
              {i.status === 'DONE'
                ? t('doneBy', { name: name(i.completedById) })
                : i.status === 'SKIPPED'
                  ? t('skipped')
                  : t('notDone')}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
