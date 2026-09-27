import type {
  HouseholdMemberDto,
  RecurrenceInput,
  RecurrenceRule,
  RotationInput,
  SeriesDto,
  Weekday,
} from '@agenda/contracts';
import { parseIsoDate, weekdayOf } from '@agenda/domain';

export const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export type RepeatPreset =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'after'
  | 'custom';
export type RepeatUnit = 'day' | 'week' | 'month' | 'year';
export type RotationKind = 'fixed' | 'alternate' | 'sequence' | 'weekday';
/** Valeur d'une étape de rotation : id de membre, « together » (à deux) ou « none » (à définir). */
export type StepValue = string;

export interface RecurrenceState {
  preset: RepeatPreset;
  interval: number;
  unit: RepeatUnit;
  weekdays: Weekday[];
  /** Tant que l'utilisateur n'a pas choisi les jours, ils suivent la date de début. */
  weekdaysAuto: boolean;
  monthDay: 'date' | 'last';
  end: 'never' | 'until' | 'count';
  until: string;
  count: number;
  rotation: RotationKind;
  /** Alternance : ordre des membres. */
  order: string[];
  sequence: StepValue[];
  /** Rotation par jour : weekday (0 = lundi) → membre | together | alternate. */
  byDay: Record<number, StepValue>;
  perWeek: boolean;
  /** « Après la dernière fois » : délai compté à partir du jour où c'est fait. */
  afterInterval: number;
  afterUnit: 'DAY' | 'WEEK' | 'MONTH';
}

export function defaultRecurrence(date: string, members: HouseholdMemberDto[]): RecurrenceState {
  const ids = members.map((m) => m.id);
  return {
    preset: 'none',
    interval: 1,
    unit: 'week',
    weekdays: [WEEKDAYS[weekdayOf(date || '2026-01-05')]!],
    weekdaysAuto: true,
    monthDay: 'date',
    end: 'never',
    until: '',
    count: 10,
    rotation: 'fixed',
    order: ids,
    sequence: ids.length ? [...ids] : ['none'],
    byDay: {},
    perWeek: false,
    afterInterval: 1,
    afterUnit: 'MONTH',
  };
}

function ruleOf(s: RecurrenceState, date: string): RecurrenceRule | null {
  const day = date ? parseIsoDate(date).day : 1;
  const byMonthDay = s.monthDay === 'last' ? -1 : day;
  const weekdays = s.weekdays.length ? s.weekdays : [WEEKDAYS[weekdayOf(date)]!];
  switch (s.preset) {
    case 'none':
      return null;
    case 'daily':
      return { freq: 'DAILY', interval: 1, weekdaysOnly: false };
    case 'weekdays':
      return { freq: 'DAILY', interval: 1, weekdaysOnly: true };
    case 'weekly':
      return { freq: 'WEEKLY', interval: 1, byWeekday: weekdays };
    case 'biweekly':
      return { freq: 'WEEKLY', interval: 2, byWeekday: weekdays };
    case 'monthly':
      return { freq: 'MONTHLY', interval: 1, byMonthDay };
    case 'quarterly':
      return { freq: 'MONTHLY', interval: 3, byMonthDay };
    case 'yearly':
      return { freq: 'YEARLY', interval: 1 };
    case 'after':
      return {
        freq: 'AFTER',
        interval: Math.max(1, Math.min(s.afterInterval, 365)),
        unit: s.afterUnit,
      };
    case 'custom': {
      const interval = Math.max(1, Math.min(s.interval, 365));
      if (s.unit === 'day') return { freq: 'DAILY', interval, weekdaysOnly: false };
      if (s.unit === 'week')
        return { freq: 'WEEKLY', interval: Math.min(interval, 52), byWeekday: weekdays };
      if (s.unit === 'month')
        return { freq: 'MONTHLY', interval: Math.min(interval, 24), byMonthDay };
      return { freq: 'YEARLY', interval: Math.min(interval, 10) };
    }
  }
}

/** Jours de semaine produits par la règle (pour la rotation « selon le jour »). */
export function ruleWeekdays(s: RecurrenceState, date: string): number[] {
  const rule = ruleOf(s, date);
  if (!rule) return [];
  if (rule.freq === 'WEEKLY') return rule.byWeekday.map((w) => WEEKDAYS.indexOf(w)).sort();
  if (rule.freq === 'DAILY') return rule.weekdaysOnly ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6];
  return [];
}

const stepMembers = (v: StepValue, members: HouseholdMemberDto[]) =>
  v === 'together' ? members.map((m) => m.id) : v === 'none' ? [] : [v];

/** Rotation à partir du choix « Responsable » (mode fixe) ou des réglages de rotation. */
export function rotationOf(
  s: RecurrenceState,
  assignee: StepValue,
  members: HouseholdMemberDto[],
  date: string,
): RotationInput {
  switch (s.rotation) {
    case 'fixed': {
      const ids = stepMembers(assignee, members);
      return ids.length === 0
        ? { mode: 'UNASSIGNED' }
        : ids.length === 1
          ? { mode: 'FIXED', memberIds: ids }
          : { mode: 'TOGETHER', memberIds: ids };
    }
    case 'alternate':
      return s.order.length >= 2
        ? { mode: 'ALTERNATE', memberIds: s.order }
        : { mode: 'UNASSIGNED' };
    case 'sequence': {
      const steps = s.sequence.map((v) => stepMembers(v, members)).filter((ids) => ids.length);
      return steps.length ? { mode: 'SEQUENCE', sequence: steps } : { mode: 'UNASSIGNED' };
    }
    case 'weekday': {
      const days = ruleWeekdays(s, date)
        .map((weekday) => {
          const v = s.byDay[weekday] ?? 'alternate';
          const sequence =
            v === 'alternate' ? members.map((m) => [m.id]) : [stepMembers(v, members)];
          return { weekday, sequence: sequence.filter((ids) => ids.length) };
        })
        .filter((d) => d.sequence.length);
      return days.length ? { mode: 'WEEKDAY', days } : { mode: 'UNASSIGNED' };
    }
  }
}

export function toRecurrenceInput(
  s: RecurrenceState,
  date: string,
  assignee: StepValue,
  members: HouseholdMemberDto[],
  personal: boolean,
): RecurrenceInput | null {
  const rule = ruleOf(s, date);
  if (!rule) return null;
  const after = rule.freq === 'AFTER';
  return {
    rule,
    until: s.end === 'until' && s.until ? s.until : null,
    count: s.end === 'count' && !after ? Math.max(1, Math.min(s.count, 1000)) : null,
    rotation: personal ? { mode: 'UNASSIGNED' } : rotationOf(s, assignee, members, date),
    advance: s.perWeek && !after ? 'PER_WEEK' : 'PER_OCCURRENCE',
  };
}

/** Pré-remplit le formulaire depuis une série existante. Renvoie aussi le choix « Responsable ». */
export function fromSeries(
  series: SeriesDto,
  members: HouseholdMemberDto[],
): { state: RecurrenceState; assignee: StepValue } {
  const base = defaultRecurrence(series.startDate, members);
  const r = series.rule;
  let preset: RepeatPreset = 'custom';
  let unit: RepeatUnit = 'week';
  let interval = r.interval;
  let weekdays = base.weekdays;
  let monthDay: 'date' | 'last' = 'date';
  let afterInterval = base.afterInterval;
  let afterUnit = base.afterUnit;
  if (r.freq === 'AFTER') {
    preset = 'after';
    afterInterval = r.interval;
    afterUnit = r.unit;
  } else if (r.freq === 'DAILY') {
    unit = 'day';
    preset = r.weekdaysOnly ? 'weekdays' : r.interval === 1 ? 'daily' : 'custom';
  } else if (r.freq === 'WEEKLY') {
    weekdays = r.byWeekday;
    preset = r.interval === 1 ? 'weekly' : r.interval === 2 ? 'biweekly' : 'custom';
  } else if (r.freq === 'MONTHLY') {
    unit = 'month';
    monthDay = r.byMonthDay === -1 ? 'last' : 'date';
    preset = r.interval === 1 ? 'monthly' : r.interval === 3 ? 'quarterly' : 'custom';
  } else {
    unit = 'year';
    preset = r.interval === 1 ? 'yearly' : 'custom';
  }
  interval = r.interval;

  const all = members
    .map((m) => m.id)
    .sort()
    .join();
  const stepValue = (ids: string[]): StepValue =>
    ids.length === 0
      ? 'none'
      : ids.length > 1 && [...ids].sort().join() === all
        ? 'together'
        : ids[0]!;
  const rot = series.rotation;
  const state: RecurrenceState = {
    ...base,
    preset,
    unit,
    interval,
    weekdays,
    weekdaysAuto: false,
    monthDay,
    afterInterval,
    afterUnit,
    end: series.untilDate ? 'until' : series.count ? 'count' : 'never',
    until: series.untilDate ?? '',
    count: series.count ?? 10,
    perWeek: series.advance === 'PER_WEEK',
    rotation:
      rot.mode === 'ALTERNATE'
        ? 'alternate'
        : rot.mode === 'SEQUENCE'
          ? 'sequence'
          : rot.mode === 'WEEKDAY'
            ? 'weekday'
            : 'fixed',
    order: rot.mode === 'ALTERNATE' ? rot.memberIds : base.order,
    sequence: rot.mode === 'SEQUENCE' ? rot.sequence.map(stepValue) : base.sequence,
    byDay:
      rot.mode === 'WEEKDAY'
        ? Object.fromEntries(
            rot.days.map((d) => [
              d.weekday,
              d.sequence.length > 1 ? 'alternate' : stepValue(d.sequence[0] ?? []),
            ]),
          )
        : {},
  };
  const assignee =
    rot.mode === 'FIXED' || rot.mode === 'TOGETHER' ? stepValue(rot.memberIds) : 'none';
  return { state, assignee };
}

/** Clé de comparaison : la récurrence a-t-elle changé dans le formulaire ? */
export const recurrenceKey = (r: RecurrenceInput | null) => JSON.stringify(r);

/** La date de début change : les jours de répétition suivent, sauf choix explicite. */
export function withStartDate(s: RecurrenceState, date: string): RecurrenceState {
  return s.weekdaysAuto && date ? { ...s, weekdays: [WEEKDAYS[weekdayOf(date)]!] } : s;
}
