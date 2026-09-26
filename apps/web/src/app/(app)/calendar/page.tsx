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
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { useSession } from '@/components/app/household-context';
import { useWeekdayName } from '@/components/app/recurrence-text';
import { useTaskDialog } from '@/components/app/use-task-dialog';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { formatTime, useToday } from '@/lib/format';
import { useOccurrences } from '@/lib/tasks';

type View = 'day' | 'week' | 'month';
const HOUR_PX = 48;
const DEFAULT_START = 7;
const DEFAULT_END = 23;

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

function range(view: View, anchor: string): { from: string; to: string; days: string[] } {
  if (view === 'day') return { from: anchor, to: anchor, days: [anchor] };
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

function shift(view: View, anchor: string, dir: number): string {
  if (view === 'day') return addDays(anchor, dir);
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
  const { from, to, days } = range(view, anchor);
  const occurrences = useOccurrences(household.id, { view: 'all', from, to, limit: 500 });
  const items = occurrences.data ?? [];

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
            onClick={() => go({ date: shift(view, anchor, -1) })}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('next')}
            onClick={() => go({ date: shift(view, anchor, 1) })}
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
          label: t(`views.${v}`),
        }))}
      />

      {!occurrences.data ? (
        <Skeleton className="h-[32rem] w-full" />
      ) : view === 'month' ? (
        <MonthGrid
          days={days}
          anchor={anchor}
          today={today}
          items={items}
          onOpen={dialog.openEdit}
          onPick={(d) => go({ view: 'day', date: d })}
          dayName={dayName}
        />
      ) : (
        <TimeGrid
          days={days}
          today={today}
          items={items}
          onOpen={dialog.openEdit}
          onCreate={dialog.openNew}
          dayName={dayName}
        />
      )}
      {dialog.dialog}
    </div>
  );
}

function TimeGrid({
  days,
  today,
  items,
  onOpen,
  onCreate,
  dayName,
}: {
  days: string[];
  today: string;
  items: OccurrenceDto[];
  onOpen: (o: OccurrenceDto) => void;
  onCreate: (draft: { date: string; startMinute: number }) => void;
  dayName: (weekday: number, style?: 'long' | 'short' | 'narrow') => string;
}) {
  const t = useTranslations('calendar');
  const { household } = useSession();
  const byDay = new Map(days.map((d) => [d, items.filter((o) => o.date === d)]));
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

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div className={cn(days.length > 1 && 'min-w-[40rem]')}>
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
              <div key={d} className="flex flex-col gap-1 border-l border-border p-1">
                {byDay
                  .get(d)!
                  .filter((o) => o.startMinute == null)
                  .map((o) => (
                    <Block key={o.id} o={o} members={household.members} onOpen={onOpen} compact />
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
            <div key={d} className="relative border-l border-border">
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
                    height: Math.max(((end - start) / 60) * HOUR_PX, 22),
                    left: `${(lane / lanes) * 100}%`,
                    width: `${100 / lanes}%`,
                  }}
                >
                  <Block
                    o={o}
                    members={household.members}
                    onOpen={onOpen}
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
  compact,
}: {
  o: OccurrenceDto;
  members: HouseholdMemberDto[];
  onOpen: (o: OccurrenceDto) => void;
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
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-sm border-l-[3px] px-1.5 py-1 text-left text-xs',
        blockColor(o, members),
        done && 'opacity-55',
        compact && 'py-0.5',
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
  dayName,
}: {
  days: string[];
  anchor: string;
  today: string;
  items: OccurrenceDto[];
  onOpen: (o: OccurrenceDto) => void;
  onPick: (date: string) => void;
  dayName: (weekday: number, style?: 'long' | 'short' | 'narrow') => string;
}) {
  const t = useTranslations('calendar');
  const { household } = useSession();
  const month = anchor.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="py-2 text-center text-xs text-text-muted first-letter:uppercase">
            {dayName(i, 'short')}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dayItems = items.filter((o) => o.date === d);
          return (
            <div
              key={d}
              className={cn(
                'min-h-24 border-b border-l border-border p-1 first:border-l-0 [&:nth-child(7n+1)]:border-l-0',
                d.slice(0, 7) !== month && 'bg-bg/60',
              )}
            >
              <button
                type="button"
                onClick={() => onPick(d)}
                aria-label={t('openDay', { date: d })}
                className={cn(
                  'mb-1 inline-flex size-7 items-center justify-center rounded-full text-xs tabular-nums',
                  d === today
                    ? 'bg-accent font-semibold text-accent-fg'
                    : d.slice(0, 7) !== month
                      ? 'text-text-muted/60'
                      : 'text-text-muted',
                )}
              >
                {Number(d.slice(8, 10))}
              </button>
              <div className="flex flex-col gap-0.5">
                {dayItems.slice(0, 3).map((o) => (
                  <Block key={o.id} o={o} members={household.members} onOpen={onOpen} compact />
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

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}
