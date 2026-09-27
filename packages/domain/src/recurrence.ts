import {
  addDays,
  daysInMonth,
  formatIsoDate,
  type IsoDate,
  parseIsoDate,
  startOfWeek,
  diffDays,
} from './dates';

/**
 * Moteur de récurrence : sous-ensemble maîtrisé de RRULE (RFC 5545).
 * Même structure que le schéma Zod `RecurrenceRule` de @agenda/contracts (le domaine n'en dépend pas).
 */
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
export const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export type Rule =
  | { freq: 'DAILY'; interval: number; weekdaysOnly?: boolean }
  | { freq: 'WEEKLY'; interval: number; byWeekday: Weekday[] }
  | { freq: 'MONTHLY'; interval: number; byMonthDay: number }
  | { freq: 'YEARLY'; interval: number }
  | { freq: 'AFTER'; interval: number; unit: 'DAY' | 'WEEK' | 'MONTH' };

export interface SeriesBounds {
  startDate: IsoDate;
  /** Inclus. */
  untilDate?: IsoDate | null;
  /** Nombre maximal d'occurrences. */
  count?: number | null;
}

export interface GeneratedOccurrence {
  date: IsoDate;
  /** Rang dans la série (0 = première occurrence) : entrée de la rotation. */
  index: number;
  /** Rang parmi les occurrences tombant le même jour de semaine (rotation « par jour »). */
  weekdayIndex: number;
  /** Semaines ISO écoulées depuis la semaine de début (rotation « par semaine »). */
  weekIndex: number;
}

/** Garde-fou : une règle ne produisant jamais de date (ex. le 31 tous les 12 mois en février) ne boucle pas. */
const MAX_EMPTY_STEPS = 5000;

function* candidateDates(rule: Rule, startDate: IsoDate): Generator<IsoDate> {
  const start = parseIsoDate(startDate);
  switch (rule.freq) {
    case 'DAILY': {
      const step = rule.weekdaysOnly ? 1 : Math.max(1, rule.interval);
      for (let d = startDate; ; d = addDays(d, step)) {
        if (!rule.weekdaysOnly || weekdayNumber(d) < 5) yield d;
      }
    }
    case 'WEEKLY': {
      const days = [...new Set(rule.byWeekday.map((w) => WEEKDAYS.indexOf(w)))].sort(
        (a, b) => a - b,
      );
      const firstMonday = startOfWeek(startDate);
      for (let w = 0; ; w += Math.max(1, rule.interval)) {
        for (const wd of days) {
          const d = addDays(firstMonday, w * 7 + wd);
          if (d >= startDate) yield d;
        }
      }
    }
    case 'MONTHLY': {
      for (let m = 0; ; m += Math.max(1, rule.interval)) {
        const monthIndex = start.month - 1 + m;
        const year = start.year + Math.floor(monthIndex / 12);
        const month = (monthIndex % 12) + 1;
        const dim = daysInMonth(year, month);
        const day = rule.byMonthDay === -1 ? dim : rule.byMonthDay;
        // RFC 5545 : un mois sans ce jour (ex. le 31) est ignoré ; « dernier jour » = -1.
        if (day <= dim) {
          const d = formatIsoDate(year, month, day);
          if (d >= startDate) yield d;
        } else yield '';
      }
    }
    case 'AFTER':
      // Une seule occurrence connue d'avance : la suivante dépend du jour où celle-ci est faite.
      yield startDate;
      return;
    case 'YEARLY': {
      for (let y = 0; ; y += Math.max(1, rule.interval)) {
        const year = start.year + y;
        // 29 février : uniquement les années bissextiles (RFC 5545).
        if (start.day <= daysInMonth(year, start.month))
          yield formatIsoDate(year, start.month, start.day);
        else yield '';
      }
    }
  }
}

const weekdayNumber = (d: IsoDate) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Occurrences dans l'ordre, jusqu'à `untilDate` / `count` (infini sinon : l'appelant s'arrête). */
export function* iterateSeries(rule: Rule, bounds: SeriesBounds): Generator<GeneratedOccurrence> {
  const perWeekday = new Array<number>(7).fill(0);
  const firstMonday = startOfWeek(bounds.startDate);
  let index = 0;
  let empty = 0;
  for (const date of candidateDates(rule, bounds.startDate)) {
    if (!date) {
      if (++empty > MAX_EMPTY_STEPS) return;
      continue;
    }
    empty = 0;
    if (bounds.untilDate && date > bounds.untilDate) return;
    if (bounds.count != null && index >= bounds.count) return;
    const wd = weekdayNumber(date);
    yield {
      date,
      index,
      weekdayIndex: perWeekday[wd]!,
      weekIndex: Math.floor(diffDays(firstMonday, date) / 7),
    };
    perWeekday[wd]! += 1;
    index += 1;
  }
}

/** Occurrences comprises dans [from, to] (inclus). */
export function expandSeries(
  rule: Rule,
  bounds: SeriesBounds,
  window: { from: IsoDate; to: IsoDate },
  limit = 2000,
): GeneratedOccurrence[] {
  const out: GeneratedOccurrence[] = [];
  for (const occ of iterateSeries(rule, bounds)) {
    if (occ.date > window.to) break;
    if (occ.date >= window.from) out.push(occ);
    if (out.length >= limit) break;
  }
  return out;
}

/** La date de début fait-elle partie de la série ? (sinon la 1re occurrence est plus tard). */
export function firstOccurrence(rule: Rule, bounds: SeriesBounds): IsoDate | null {
  for (const occ of iterateSeries(rule, bounds)) return occ.date;
  return null;
}

/**
 * Règle « après la dernière fois » : date de la prochaine occurrence quand la précédente est faite
 * (ou passée) le jour `doneDate`. Un mois plus tard que le 31 janvier = le 28/29 février.
 */
export function nextAfter(rule: Extract<Rule, { freq: 'AFTER' }>, doneDate: IsoDate): IsoDate {
  const n = Math.max(1, rule.interval);
  if (rule.unit === 'DAY') return addDays(doneDate, n);
  if (rule.unit === 'WEEK') return addDays(doneDate, 7 * n);
  const d = parseIsoDate(doneDate);
  const monthIndex = d.month - 1 + n;
  const year = d.year + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return formatIsoDate(year, month, Math.min(d.day, daysInMonth(year, month)));
}
