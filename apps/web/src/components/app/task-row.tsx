'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import { Check, ChevronsUp, ChevronUp, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatDuration, formatTime, useDayLabel } from '@/lib/format';
import { useToggleDone } from '@/lib/tasks';
import { useToast } from '@/components/ui/toast';
import { AssigneeAvatars, useAssigneeLabel } from './assignees';
import { useSession } from './household-context';

export function TaskRow({
  occurrence: o,
  onOpen,
  showDate = false,
}: {
  occurrence: OccurrenceDto;
  onOpen: (o: OccurrenceDto) => void;
  showDate?: boolean;
}) {
  const t = useTranslations('tasks');
  const { household } = useSession();
  const assigneeLabel = useAssigneeLabel(household);
  const dayLabel = useDayLabel();
  const toggle = useToggleDone(household.id);
  const toast = useToast();
  const done = o.status === 'DONE';

  const onToggle = () => {
    toggle.mutate(
      { id: o.id, done: !done },
      {
        onSuccess: () => {
          if (!done) {
            toast({
              message: t('completedToast', { title: o.title }),
              action: { label: t('undo'), onClick: () => toggle.mutate({ id: o.id, done: false }) },
            });
          }
        },
        onError: () => toast({ message: t('toggleError'), tone: 'error' }),
      },
    );
  };

  const meta = [
    showDate && o.date ? dayLabel(o.date) : null,
    o.startMinute != null ? formatTime(o.startMinute) : null,
    o.durationMinutes ? formatDuration(o.durationMinutes) : null,
  ].filter(Boolean);

  return (
    <li className="group flex items-start gap-3 px-4 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t(done ? 'markTodo' : 'markDone', { title: o.title })}
        onClick={onToggle}
        className="-m-2.5 flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <span
          className={cn(
            'flex size-[1.375rem] items-center justify-center rounded-full border-[1.5px] transition-colors duration-(--gn-motion-base)',
            done
              ? 'border-success bg-success text-white'
              : 'border-text-muted/60 group-hover:border-text-muted',
          )}
        >
          {done && <Check aria-hidden className="size-3.5 stroke-[3]" />}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onOpen(o)}
        className="flex min-w-0 flex-1 flex-col gap-1 text-left"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn('truncate text-[0.9375rem]', done && 'text-text-muted line-through')}>
            {o.title}
          </span>
          {meta.length > 0 && (
            <span className="shrink-0 text-[0.8125rem] tabular-nums text-text-muted">
              {meta.join(' · ')}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <AssigneeAvatars household={household} ids={o.assigneeIds} />
            {assigneeLabel(o.assigneeIds)}
          </span>
          {o.category && (
            <span>
              · {o.category.emoji ? `${o.category.emoji} ` : ''}
              {o.category.name}
            </span>
          )}
          {o.visibility === 'PERSONAL' && (
            <span className="inline-flex items-center gap-1">
              · <Lock aria-hidden className="size-3" />
              {t('personal')}
            </span>
          )}
          {o.priority === 'HIGH' && (
            <span className="inline-flex items-center gap-0.5 text-warning">
              · <ChevronUp aria-hidden className="size-3.5" />
              {t('priority.HIGH')}
            </span>
          )}
          {o.priority === 'URGENT' && (
            <span className="inline-flex items-center gap-0.5 text-danger">
              · <ChevronsUp aria-hidden className="size-3.5" />
              {t('priority.URGENT')}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function TaskList({
  items,
  onOpen,
  showDate,
  label,
}: {
  items: OccurrenceDto[];
  onOpen: (o: OccurrenceDto) => void;
  showDate?: boolean;
  label?: string;
}) {
  return (
    <ul
      aria-label={label}
      className="divide-y divide-border rounded-lg border border-border bg-surface"
    >
      {items.map((o) => (
        <TaskRow key={o.id} occurrence={o} onOpen={onOpen} showDate={showDate} />
      ))}
    </ul>
  );
}
