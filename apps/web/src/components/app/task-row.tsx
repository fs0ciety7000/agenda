'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  Heart,
  ChevronsUp,
  ChevronUp,
  Lock,
  RefreshCw,
  ListChecks,
  MessageCircle,
  Repeat,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatDuration, formatTime, useDayLabel, useDueLabel } from '@/lib/format';
import { useThanks, useToggleDone } from '@/lib/tasks';
import { useToast } from '@/components/ui/toast';
import { AssigneeAvatars, useAssigneeLabel } from './assignees';
import { useSession } from './household-context';
import { useLastDoneText } from './series-history';

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
  const tl = useTranslations('checklist');
  const { household, me } = useSession();
  const myId = household.members.find((m) => m.userId === me.id)?.id ?? '';
  const thanks = useThanks(household.id, myId);
  const assigneeLabel = useAssigneeLabel(household);
  const dayLabel = useDayLabel();
  const dueLabel = useDueLabel();
  const toggle = useToggleDone(household.id);
  const toast = useToast();
  const done = o.status === 'DONE';
  const nameOf = (id: string) => household.members.find((m) => m.id === id)?.displayName ?? '?';
  const thankedBy = o.thankedBy ?? [];
  // Faite par quelqu'un d'autre : je peux dire merci. Faite par moi : je vois les merci reçus.
  const canThank = done && !!o.completedById && o.completedById !== myId;
  const iThanked = thankedBy.includes(myId);
  const thanksReceived =
    done && o.completedById === myId ? thankedBy.filter((id) => id !== myId) : [];
  const lastDoneText = useLastDoneText();
  // Utile surtout pour les tâches espacées (« après la dernière fois ») : pas pour le quotidien.
  const showLastDone =
    !done && o.lastDone && Date.now() - new Date(o.lastDone.at).getTime() >= 7 * 86_400_000;

  const onToggle = () => {
    toggle.mutate(
      { hid: household.id, id: o.id, done: !done },
      {
        onSuccess: () => {
          if (!done) {
            toast({
              message: t('completedToast', { title: o.title }),
              action: {
                label: t('undo'),
                onClick: () => toggle.mutate({ hid: household.id, id: o.id, done: false }),
              },
            });
          }
        },
        onError: () => toast({ message: t('toggleError'), tone: 'error' }),
      },
    );
  };

  const meta = [
    showDate && o.date ? dayLabel(o.date) : null,
    !o.date && o.dueDate ? dueLabel(o.dueDate) : null,
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
              ? 'animate-[check-pop_280ms_ease-out] border-success bg-success text-white'
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
          <span
            className={cn(
              'truncate text-[0.9375rem] transition-colors duration-(--gn-motion-base)',
              done && 'text-text-muted line-through',
            )}
          >
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
          {o.calendarSync && <SyncBadge state={o.calendarSync} />}
          {o.isRecurring && (
            <span className="inline-flex items-center gap-1">
              · <Repeat aria-hidden className="size-3" />
              <span className="sr-only">{t('recurring')}</span>
            </span>
          )}
          {showLastDone && <span>· {lastDoneText(o.lastDone!, true)}</span>}
          {thanksReceived.length > 0 && (
            <span className="inline-flex items-center gap-1 text-accent">
              · <Heart aria-hidden className="size-3.5 fill-current" />
              {t('thanksFrom', { names: thanksReceived.map(nameOf).join(' & ') })}
            </span>
          )}
          {(o.commentCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              · <MessageCircle aria-hidden className="size-3.5" />
              <span aria-hidden>{o.commentCount}</span>
              <span className="sr-only">{t('commentCount', { count: o.commentCount! })}</span>
            </span>
          )}
          {o.checklist.length > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              · <ListChecks aria-hidden className="size-3.5" />
              <span aria-hidden>
                {o.checklist.filter((i) => i.done).length}/{o.checklist.length}
              </span>
              <span className="sr-only">
                {tl('rowProgress', {
                  done: o.checklist.filter((i) => i.done).length,
                  total: o.checklist.length,
                })}
              </span>
            </span>
          )}
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
      {canThank && (
        <button
          type="button"
          aria-pressed={iThanked}
          aria-label={
            iThanked
              ? t('thanksSent', { name: nameOf(o.completedById!) })
              : t('sayThanks', { name: nameOf(o.completedById!) })
          }
          title={
            iThanked
              ? t('thanksSent', { name: nameOf(o.completedById!) })
              : t('sayThanks', { name: nameOf(o.completedById!) })
          }
          disabled={thanks.isPending}
          onClick={() =>
            thanks.mutate(
              { id: o.id, thank: !iThanked },
              { onError: () => toast({ message: t('toggleError'), tone: 'error' }) },
            )
          }
          className={cn(
            '-my-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-muted',
            iThanked ? 'text-accent' : 'text-text-muted',
          )}
        >
          <Heart
            aria-hidden
            className={cn('size-5', iThanked && 'animate-[check-pop_280ms_ease-out] fill-current')}
          />
        </button>
      )}
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

/** ✓ Synchronisé · ⟳ Synchronisation… · ⚠ Problème — icône + texte pour les lecteurs d'écran. */
function SyncBadge({ state }: { state: NonNullable<OccurrenceDto['calendarSync']> }) {
  const t = useTranslations('calendarSync.state');
  const Icon = state === 'SYNCED' ? CalendarCheck : state === 'PENDING' ? RefreshCw : AlertTriangle;
  return (
    <span
      className={
        state === 'ERROR' || state === 'BLOCKED'
          ? 'inline-flex items-center gap-1 text-warning'
          : 'inline-flex items-center gap-1'
      }
      title={t(state)}
    >
      · <Icon aria-hidden className="size-3" />
      <span className="sr-only">{t(state)}</span>
    </span>
  );
}
