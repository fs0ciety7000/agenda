'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import { weekBoard, type WeekBoardRowKey } from '@agenda/domain';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AssigneeAvatars } from '@/components/app/assignees';
import { useSession } from '@/components/app/household-context';
import { TaskList } from '@/components/app/task-row';
import { cn } from '@/lib/cn';
import { useDayLabel } from '@/lib/format';

/**
 * Qui fait quoi sur les 7 prochains jours : une ligne par personne (puis « Tous les deux » et
 * « À définir »), une colonne par jour, le nombre de tâches dans chaque case. Toucher une case
 * affiche ses tâches dessous. Pas de total par personne : le tableau informe, il ne classe pas.
 */
export function WeekBoard({
  items,
  today,
  onOpen,
}: {
  items: OccurrenceDto[];
  today: string;
  onOpen: (o: OccurrenceDto) => void;
}) {
  const t = useTranslations('today');
  const tt = useTranslations('tasks');
  const format = useFormatter();
  const dayLabel = useDayLabel();
  const { household } = useSession();
  const [picked, setPicked] = useState<{ key: WeekBoardRowKey; day: number } | null>(null);
  const board = weekBoard(
    items,
    today,
    household.members.map((m) => m.id),
  );
  if (!board.rows.some((r) => r.cells.some((c) => c.length > 0))) return null;

  const who = (key: WeekBoardRowKey) =>
    key === 'together'
      ? tt('bothOfUs')
      : key === 'unassigned'
        ? tt('unassigned')
        : (household.members.find((m) => m.id === key)?.displayName ?? '');
  const avatarIds = (key: WeekBoardRowKey) =>
    key === 'together' ? household.members.map((m) => m.id) : key === 'unassigned' ? [] : [key];
  const weekday = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { timeZone: 'UTC', weekday: 'short' });
  const pickedItems = picked && board.rows.find((r) => r.key === picked.key)?.cells[picked.day];

  return (
    <section aria-labelledby="board-heading" className="flex flex-col gap-3">
      <h2
        id="board-heading"
        className="text-xs font-medium uppercase tracking-[0.04em] text-text-muted"
      >
        {t('boardTitle')}
      </h2>
      <div className="rounded-lg border border-border bg-surface p-2 sm:p-3">
        <table className="w-full table-fixed border-separate border-spacing-0.5 text-center">
          <caption className="sr-only">{t('boardTitle')}</caption>
          <thead>
            <tr>
              <td className="w-10 sm:w-32" />
              {board.days.map((d) => (
                <th
                  key={d}
                  scope="col"
                  aria-current={d === today ? 'date' : undefined}
                  className={cn(
                    'rounded-md px-0 py-1 text-xs font-medium',
                    d === today ? 'text-accent' : 'text-text-muted',
                  )}
                >
                  <span className="sr-only">{dayLabel(d, 'long')}</span>
                  <span aria-hidden className="flex flex-col leading-tight">
                    <span className="truncate first-letter:uppercase">{weekday(d)}</span>
                    <span className="tabular-nums">{Number(d.slice(8))}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="py-1 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <AssigneeAvatars household={household} ids={avatarIds(row.key)} />
                    <span className="sr-only truncate text-sm sm:not-sr-only">{who(row.key)}</span>
                  </span>
                </th>
                {row.cells.map((cell, i) => {
                  const day = board.days[i]!;
                  const label = t('boardCell', {
                    who: who(row.key),
                    day: dayLabel(day, 'long'),
                    count: cell.length,
                  });
                  if (cell.length === 0) {
                    return (
                      <td key={day} className="text-text-muted" aria-label={label}>
                        <span aria-hidden>·</span>
                      </td>
                    );
                  }
                  const active = picked?.key === row.key && picked.day === i;
                  return (
                    <td key={day}>
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={active}
                        onClick={() => setPicked(active ? null : { key: row.key, day: i })}
                        className={cn(
                          'flex h-11 w-full items-center justify-center rounded-md text-sm font-medium tabular-nums transition-colors',
                          active
                            ? 'bg-accent text-accent-fg'
                            : 'bg-surface-muted text-text hover:bg-border',
                        )}
                      >
                        {cell.length}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-1 pt-2 text-xs text-text-muted">{t('boardHint')}</p>
      </div>
      {picked && pickedItems && pickedItems.length > 0 && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <h3 className="text-sm font-medium first-letter:uppercase">
            {who(picked.key)} · {dayLabel(board.days[picked.day]!, 'long')}
          </h3>
          <TaskList
            items={pickedItems}
            onOpen={onOpen}
            label={`${who(picked.key)} · ${dayLabel(board.days[picked.day]!, 'long')}`}
          />
        </div>
      )}
    </section>
  );
}
