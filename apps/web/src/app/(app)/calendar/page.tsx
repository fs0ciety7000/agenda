'use client';

import type { HouseholdMemberDto, OccurrenceDto } from '@agenda/contracts';
import {
  addDays,
  daysInMonth,
  parseIsoDate,
  startOfWeek,
  wallClock,
  weekdayOf,
} from '@agenda/domain';
import { CalendarArrowUp, ChevronLeft, ChevronRight, Plus, Repeat } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Suspense, useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  nudge,
  placementOf,
  useCalendarDrag,
  type DragMode,
  type Placement,
} from '@/components/app/calendar-drag';
import { useSession } from '@/components/app/household-context';
import { TaskList } from '@/components/app/task-row';
import { useWeekdayName } from '@/components/app/recurrence-text';
import { useTaskDialog } from '@/components/app/use-task-dialog';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { formatTime, useDayLabel, useToday } from '@/lib/format';
import { useMoveOccurrence, useOccurrences } from '@/lib/tasks';

type View = 'day' | 'week' | 'month';
const HOUR_PX = 48;
const DEFAULT_START = 7;
const DEFAULT_END = 23;
const DRAG_HINT_ID = 'calendar-drag-hint';

const MEMBER_BLOCK: Record<HouseholdMemberDto['color'], string> = {
  sage: 'bg-member-sage/15 border-member-sage',
  ocean: 'bg-member-ocean/15 border-member-ocean',
  amber: 'bg-member-amber/15 border-member-amber',
  plum: 'bg-member-plum/15 border-member-plum',
  clay: 'bg-member-clay/15 border-member-clay',
  slate: 'bg-member-slate/15 border-member-slate',
};

function blockColor(o: OccurrenceDto, members: HouseholdMemberDto[]): string {
  if (o.assigneeIds.length !== 1) return 'bg-surface-muted border-text-muted';
  const m = members.find((x) => x.id === o.assigneeIds[0]);
  return m ? MEMBER_BLOCK[m.color] : 'bg-surface-muted border-text-muted';
}

/** Téléphone (< 768 px) : vue 3 jours au lieu de la semaine, mois en points. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

function range(
  view: View,
  anchor: string,
  threeDays = false,
): { from: string; to: string; days: string[] } {
  if (view === 'day') return { from: anchor, to: anchor, days: [anchor] };
  if (view === 'week' && threeDays) {
    const days = [anchor, addDays(anchor, 1), addDays(anchor, 2)];
    return { from: anchor, to: days[2]!, days };
  }
  if (view === 'week') {
    const from = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
    return { from, to: days[6]!, days };
  }
  const { year, month } = parseIsoDate(anchor);
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const gridStart = startOfWeek(first);
  const last = addDays(first, daysInMonth(year, month) - 1);
  const weeks = Math.ceil((weekdayOf(first) + daysInMonth(year, month)) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  return { from: days[0]!, to: days.at(-1)!, days: days.length ? days : [first, last] };
}

function shift(view: View, anchor: string, dir: number, threeDays = false): string {
  if (view === 'day') return addDays(anchor, dir);
  if (view === 'week' && threeDays) return addDays(anchor, 3 * dir);
  if (view === 'week') return addDays(anchor, 7 * dir);
  const { year, month } = parseIsoDate(anchor);
  const m = month - 1 + dir;
  const y = year + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${y}-${String(mm + 1).padStart(2, '0')}-01`;
}

/** Colonnes pour les blocs qui se chevauchent (algorithme glouton par grappe). */
function layout(items: OccurrenceDto[]) {
  const timed = items
    .filter((o) => o.startMinute != null)
    .map((o) => ({
      o,
      start: o.startMinute!,
      end: o.startMinute! + Math.max(o.durationMinutes ?? 30, 20),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: { o: OccurrenceDto; start: number; end: number; lane: number; lanes: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = lanes));
    cluster = [];
  };
  for (const item of timed) {
    if (item.start >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.end > item.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const placed = { ...item, lane, lanes: 1 };
    cluster.push(placed);
    out.push(placed);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return out;
}

function CalendarView() {
  const t = useTranslations('calendar');
  const format = useFormatter();
  const { household } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = useToday();
  const dialog = useTaskDialog();
  const dayName = useWeekdayName();
  const [defaultView, setDefaultView] = useState<View>('week');
  useEffect(() => {
    // Sur petit écran, la vue jour est plus lisible.
    if (window.matchMedia('(max-width: 767px)').matches) setDefaultView('day');
  }, []);

  const view = (
    ['day', 'week', 'month'].includes(params.get('view') ?? '') ? params.get('view') : defaultView
  ) as View;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today;
  const mobile = useIsMobile();
  const threeDays = mobile && view === 'week';
  const { from, to, days } = range(view, anchor, threeDays);
  // Mois sur téléphone : le jour touché s'affiche en liste sous la grille.
  const [picked, setPicked] = useState<string | null>(null);
  const monthOf = anchor.slice(0, 7);
  const selectedDay =
    picked?.slice(0, 7) === monthOf
      ? picked
      : today.slice(0, 7) === monthOf
        ? today
        : `${monthOf}-01`;
  const occurrences = useOccurrences(household.id, { view: 'all', from, to, limit: 500 });
  const items = occurrences.data ?? [];
  const move = useMoveOccurrence(household.id);
  const toast = useToast();
  const dayLabel = useDayLabel();

  const onMove = (o: OccurrenceDto, to: Placement) => {
    const from = placementOf(o);
    move.mutate(
      { o, ...to },
      {
        onSuccess: (updated) =>
          toast({
            message: t(
              to.date === from.date && to.startMinute === from.startMinute ? 'resized' : 'moved',
              {
                title: o.title,
                when: [
                  dayLabel(to.date),
                  to.startMinute != null ? formatTime(to.startMinute) : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              },
            ),
            action: { label: t('undo'), onClick: () => move.mutate({ o: updated, ...from }) },
          }),
        onError: () => toast({ message: t('moveError'), tone: 'error' }),
      },
    );
  };

  const go = (next: Partial<{ view: View; date: string }>) => {
    const q = new URLSearchParams(params);
    if (next.view) q.set('view', next.view);
    if (next.date) q.set('date', next.date);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const title =
    view === 'month'
      ? format.dateTime(new Date(`${anchor}T12:00:00Z`), {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : threeDays
        ? format.dateTimeRange(new Date(`${from}T12:00:00Z`), new Date(`${to}T12:00:00Z`), {
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC',
          })
        : view === 'week'
          ? t('weekOf', {
              date: format.dateTime(new Date(`${from}T12:00:00Z`), {
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              }),
            })
          : format.dateTime(new Date(`${anchor}T12:00:00Z`), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">{title}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => go({ date: today })}>
            {t('today')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('previous')}
            onClick={() => go({ date: shift(view, anchor, -1, threeDays) })}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('next')}
            onClick={() => go({ date: shift(view, anchor, 1, threeDays) })}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      <Segmented
        label={t('view')}
        className="max-w-xs"
        value={view}
        onChange={(v) => go({ view: v })}
        options={(['day', 'week', 'month'] as const).map((v) => ({
          value: v,
          label: t(v === 'week' && mobile ? 'views.threeDays' : `views.${v}`),
        }))}
      />

      {!occurrences.data ? (
        <Skeleton className="h-[32rem] w-full" />
      ) : view === 'month' && mobile ? (
        <MonthDots
          days={days}
          anchor={anchor}
          today={today}
          selected={selectedDay}
          items={items}
          onPick={setPicked}
          onOpen={dialog.openEdit}
          onCreate={(date) => dialog.openNew({ date })}
          onMove={onMove}
          dayName={dayName}
        />
      ) : view === 'month' ? (
        <MonthGrid
          days={days}
          anchor={anchor}
          today={today}
          items={items}
          onOpen={dialog.openEdit}
          onPick={(d) => go({ view: 'day', date: d })}
          onMove={onMove}
          dayName={dayName}
        />
      ) : (
        <TimeGrid
          days={days}
          today={today}
          items={items}
          onOpen={dialog.openEdit}
          onCreate={dialog.openNew}
          onMove={onMove}
          dayName={dayName}
        />
      )}
      {occurrences.data && !(mobile && view === 'month') && (
        <p id={DRAG_HINT_ID} className="text-xs text-text-muted">
          {t(mobile ? 'dragHintTouch' : 'dragHint')}
        </p>
      )}
      {dialog.dialog}
    </div>
  );
}

type MoveHandler = (o: OccurrenceDto, to: Placement) => void;

/** Remplace la tâche en cours de glissement par sa position provisoire. */
function withPreview(
  items: OccurrenceDto[],
  preview: { id: string; placement: Placement } | null,
): OccurrenceDto[] {
  if (!preview) return items;
  return items.map((o) => (o.id === preview.id ? { ...o, ...preview.placement } : o));
}

function TimeGrid({
  days,
  today,
  items,
  onOpen,
  onCreate,
  onMove,
  dayName,
}: {
  days: string[];
  today: string;
  items: OccurrenceDto[];
  onOpen: (o: OccurrenceDto) => void;
  onCreate: (draft: { date: string; startMinute: number }) => void;
  onMove: MoveHandler;
  dayName: (weekday: number, style?: 'long' | 'short' | 'narrow') => string;
}) {
  const t = useTranslations('calendar');
  const { household } = useSession();
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useCalendarDrag({ containerRef: gridRef, pxPerHour: HOUR_PX, onDrop: onMove });
  const shown = withPreview(items, drag.preview);
  const byDay = new Map(days.map((d) => [d, shown.filter((o) => o.date === d)]));
  // Plage horaire calculée sur les positions enregistrées : la grille ne bouge pas sous le pointeur.
  const timed = items.filter((o) => o.startMinute != null);
  const startHour = Math.min(DEFAULT_START, ...timed.map((o) => Math.floor(o.startMinute! / 60)));
  const endHour = Math.max(
    DEFAULT_END,
    ...timed.map((o) => Math.ceil((o.startMinute! + (o.durationMinutes ?? 30)) / 60)),
  );
  const hours = Array.from({ length: Math.min(24, endHour) - startHour }, (_, i) => startHour + i);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Heure « murale » du foyer, pas celle du navigateur.
  const nowMinute = wallClock(now, household.timezone).minute;
  const hasAllDay = items.some((o) => o.date && o.startMinute == null);
  const blockProps = (o: OccurrenceDto) => ({
    o,
    members: household.members,
    dragging: drag.preview?.id === o.id,
    onOpen: (x: OccurrenceDto) => !drag.consumeClick() && onOpen(x),
    onDragStart: (e: PointerEvent, mode: DragMode) => drag.start(e, o, mode),
    onNudge: onMove,
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div ref={gridRef} className={cn(days.length > 3 && 'min-w-[40rem]')}>
        {/* En-têtes de jours */}
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div />
          {days.map((d) => (
            <div
              key={d}
              className={cn(
                'px-2 py-2 text-center text-sm',
                d === today && 'font-semibold text-accent',
              )}
            >
              <span className="first-letter:uppercase">{dayName(weekdayOf(d), 'short')}</span>{' '}
              <span className="tabular-nums">{Number(d.slice(8, 10))}</span>
            </div>
          ))}
        </div>
        {/* Tâches sans heure */}
        {hasAllDay && (
          <div
            className="grid border-b border-border"
            style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
          >
            <div className="px-1 py-1.5 text-right text-[0.6875rem] text-text-muted">
              {t('allDay')}
            </div>
            {days.map((d) => (
              <div key={d} data-date={d} className="flex flex-col gap-1 border-l border-border p-1">
                {byDay
                  .get(d)!
                  .filter((o) => o.startMinute == null)
                  .map((o) => (
                    <Block key={o.id} {...blockProps(o)} compact />
                  ))}
              </div>
            ))}
          </div>
        )}
        {/* Grille horaire */}
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div>
            {hours.map((h) => (
              <div
                key={h}
                className="relative text-right text-[0.6875rem] tabular-nums text-text-muted"
                style={{ height: HOUR_PX }}
              >
                <span className="absolute -top-2 right-2">
                  {h === startHour ? '' : `${String(h).padStart(2, '0')}:00`}
                </span>
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} data-date={d} className="relative border-l border-border">
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={t('createAt', { time: `${String(h).padStart(2, '0')}:00` })}
                  onClick={() => onCreate({ date: d, startMinute: h * 60 })}
                  className="block w-full border-t border-border/60 hover:bg-surface-muted/60 focus-visible:bg-surface-muted"
                  style={{ height: HOUR_PX }}
                />
              ))}
              {d === today &&
                nowMinute >= startHour * 60 &&
                nowMinute < hours.length * 60 + startHour * 60 && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger"
                    style={{ top: ((nowMinute - startHour * 60) / 60) * HOUR_PX }}
                  />
                )}
              {layout(byDay.get(d)!).map(({ o, start, end, lane, lanes }) => (
                <div
                  key={o.id}
                  className="absolute z-20 px-0.5"
                  style={{
                    top: ((start - startHour * 60) / 60) * HOUR_PX,
                    height: Math.max(((end - start) / 60) * HOUR_PX, 24),
                    left: `${(lane / lanes) * 100}%`,
                    width: `${100 / lanes}%`,
                  }}
                >
                  <Block
                    {...blockProps(o)}
                    resizable
                    compact={((end - start) / 60) * HOUR_PX < 38}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Block({
  o,
  members,
  onOpen,
  onDragStart,
  onNudge,
  dragging,
  resizable,
  compact,
}: {
  o: OccurrenceDto;
  members: HouseholdMemberDto[];
  onOpen: (o: OccurrenceDto) => void;
  onDragStart?: (e: PointerEvent, mode: DragMode) => void;
  onNudge?: MoveHandler;
  dragging?: boolean;
  resizable?: boolean;
  compact?: boolean;
}) {
  const done = o.status === 'DONE';
  const names = o.assigneeIds
    .map((id) => members.find((m) => m.id === id)?.displayName)
    .filter(Boolean)
    .join(', ');
  return (
    <button
      type="button"
      onClick={() => onOpen(o)}
      onPointerDown={onDragStart && ((e) => onDragStart(e, 'move'))}
      onKeyDown={
        onNudge &&
        ((e) => {
          if (!e.altKey) return;
          const to = nudge(o, e.key, e.shiftKey);
          if (!to) return;
          e.preventDefault();
          onNudge(o, to);
        })
      }
      aria-keyshortcuts={
        onNudge ? 'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight' : undefined
      }
      aria-describedby={onNudge ? DRAG_HINT_ID : undefined}
      className={cn(
        'relative flex h-full w-full touch-manipulation select-none flex-col overflow-hidden rounded-sm border-l-[3px] px-1.5 py-1 text-left text-xs [-webkit-touch-callout:none]',
        blockColor(o, members),
        done && 'opacity-55',
        compact && 'min-h-6 py-0.5',
        onDragStart && 'cursor-grab',
        dragging &&
          'cursor-grabbing opacity-90 shadow-[0_4px_12px_rgb(0_0_0/0.18)] ring-2 ring-accent',
      )}
    >
      <span className={cn('truncate font-medium text-text', done && 'line-through')}>
        {o.isRecurring && <Repeat aria-hidden className="mr-1 inline size-3 align-[-1px]" />}
        {o.title}
      </span>
      {!compact && (
        <span className="truncate text-text-muted">
          {o.startMinute != null && formatTime(o.startMinute)}
          {names && ` · ${names}`}
        </span>
      )}
      {resizable && onDragStart && o.startMinute != null && (
        <span
          aria-hidden
          onPointerDown={(e) => onDragStart(e, 'resize')}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize after:absolute after:bottom-0.5 after:left-1/2 after:h-0.5 after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-text-muted/50"
        />
      )}
    </button>
  );
}

function MonthGrid({
  days,
  anchor,
  today,
  items,
  onOpen,
  onPick,
  onMove,
  dayName,
}: {
  days: string[];
  anchor: string;
  today: string;
  items: OccurrenceDto[];
  onOpen: (o: OccurrenceDto) => void;
  onPick: (date: string) => void;
  onMove: MoveHandler;
  dayName: (weekday: number, style?: 'long' | 'short' | 'narrow') => string;
}) {
  const t = useTranslations('calendar');
  const { household } = useSession();
  const format = useFormatter();
  const month = anchor.slice(0, 7);
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useCalendarDrag({ containerRef: gridRef, pxPerHour: 0, onDrop: onMove });
  const shown = withPreview(items, drag.preview);
  return (
    <div ref={gridRef} className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="py-2 text-center text-xs text-text-muted first-letter:uppercase">
            {dayName(i, 'short')}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dayItems = shown.filter((o) => o.date === d);
          return (
            <div
              key={d}
              data-date={d}
              className={cn(
                'min-h-24 border-b border-l border-border p-1 first:border-l-0 [&:nth-child(7n+1)]:border-l-0',
                d.slice(0, 7) !== month && 'bg-bg/60',
              )}
            >
              <button
                type="button"
                onClick={() => onPick(d)}
                aria-label={t('openDay', {
                  date: format.dateTime(new Date(`${d}T12:00:00Z`), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  }),
                })}
                className={cn(
                  'mb-1 inline-flex size-7 items-center justify-center rounded-full text-xs tabular-nums',
                  d === today
                    ? 'bg-accent font-semibold text-accent-fg'
                    : d.slice(0, 7) !== month
                      ? 'text-text-muted'
                      : 'text-text',
                )}
              >
                {Number(d.slice(8, 10))}
              </button>
              <div className="flex flex-col gap-0.5">
                {dayItems.slice(0, 3).map((o) => (
                  <Block
                    key={o.id}
                    o={o}
                    members={household.members}
                    dragging={drag.preview?.id === o.id}
                    onOpen={(x) => !drag.consumeClick() && onOpen(x)}
                    onDragStart={(e) => drag.start(e, o, 'move')}
                    onNudge={onMove}
                    compact
                  />
                ))}
                {dayItems.length > 3 && (
                  <button
                    type="button"
                    onClick={() => onPick(d)}
                    className="px-1 text-left text-[0.6875rem] text-text-muted hover:text-text"
                  >
                    {t('more', { count: dayItems.length - 3 })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Mois sur téléphone : un point par tâche (trois au plus) sous chaque jour, comme sur Android ;
 * le jour touché s'affiche en liste dessous, avec ses tâches complètes et lisibles.
 */
function MonthDots({
  days,
  anchor,
  today,
  selected,
  items,
  onPick,
  onOpen,
  onCreate,
  onMove,
  dayName,
}: {
  days: string[];
  anchor: string;
  today: string;
  selected: string;
  items: OccurrenceDto[];
  onPick: (date: string) => void;
  onOpen: (o: OccurrenceDto) => void;
  onCreate: (date: string) => void;
  onMove: MoveHandler;
  dayName: (weekday: number, style?: 'long' | 'short' | 'narrow') => string;
}) {
  const t = useTranslations('calendar');
  // Déplacer au doigt sans glisser : « Déplacer », puis toucher le jour voulu.
  const [moving, setMoving] = useState<OccurrenceDto | null>(null);
  const pick = (d: string) => {
    if (moving) {
      if (d !== moving.date) onMove(moving, { ...placementOf(moving), date: d });
      setMoving(null);
    }
    onPick(d);
  };
  const format = useFormatter();
  const month = anchor.slice(0, 7);
  const longDate = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  const dayItems = items
    .filter((o) => o.date === selected)
    .sort((a, b) => (a.startMinute ?? -1) - (b.startMinute ?? -1));
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-2">
        <div className="grid grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="pb-1 text-center text-xs text-text-muted first-letter:uppercase"
            >
              {dayName(i, 'narrow')}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((d) => {
            const count = items.filter((o) => o.date === d).length;
            const outside = d.slice(0, 7) !== month;
            return (
              <button
                key={d}
                type="button"
                onClick={() => pick(d)}
                aria-pressed={d === selected}
                aria-label={t('dayWithCount', { date: longDate(d), count })}
                className="flex min-h-12 flex-col items-center justify-start gap-1 rounded-md pt-1"
              >
                <span
                  className={cn(
                    'inline-flex size-8 items-center justify-center rounded-full text-sm tabular-nums',
                    d === selected
                      ? 'bg-accent font-semibold text-accent-fg'
                      : d === today
                        ? 'font-semibold text-accent ring-1 ring-accent'
                        : outside
                          ? 'text-text-muted'
                          : 'text-text',
                  )}
                >
                  {Number(d.slice(8, 10))}
                </span>
                <span aria-hidden className="flex h-1.5 items-center gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'size-1.5 rounded-full',
                        outside ? 'bg-text-muted' : 'bg-accent',
                      )}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {moving && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent bg-surface px-4 py-3 text-[0.9375rem]"
        >
          <span>{t('movePick', { title: moving.title })}</span>
          <Button variant="ghost" size="sm" onClick={() => setMoving(null)}>
            {t('moveCancel')}
          </Button>
        </div>
      )}
      <section aria-labelledby="picked-day" className="flex flex-col gap-2">
        <h2 id="picked-day" className="font-semibold first-letter:uppercase">
          {longDate(selected)}
        </h2>
        {dayItems.length ? (
          <TaskList
            items={dayItems}
            onOpen={onOpen}
            label={longDate(selected)}
            trailing={(o) => (
              <button
                type="button"
                onClick={() => setMoving(o)}
                aria-label={t('moveTo', { title: o.title })}
                aria-pressed={moving?.id === o.id}
                className="-my-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-muted hover:text-text"
              >
                <CalendarArrowUp aria-hidden className="size-5" />
              </button>
            )}
          />
        ) : (
          <p className="text-[0.9375rem] text-text-muted">{t('dayEmpty')}</p>
        )}
        <Button variant="ghost" size="sm" className="self-start" onClick={() => onCreate(selected)}>
          <Plus aria-hidden className="size-4" />
          {t('addOnDay')}
        </Button>
      </section>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}
