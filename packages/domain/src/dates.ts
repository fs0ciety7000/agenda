/**
 * Dates « murales » : une date locale `YYYY-MM-DD` + des minutes depuis minuit, interprétées
 * dans le fuseau IANA du foyer. Aucune dépendance : Intl suffit (données tz de Node/ICU).
 */

export type IsoDate = string; // YYYY-MM-DD

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const m = ISO_DATE.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function isValidIsoDate(date: string): boolean {
  const m = ISO_DATE.exec(date);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === date;
}

export function formatIsoDate(year: number, month: number, day: number): IsoDate {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  return formatIsoDate(year, month, day + days);
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

/** 0 = lundi … 6 = dimanche (ISO 8601). */
export function weekdayOf(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** Lundi de la semaine ISO contenant `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -weekdayOf(date));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/** Heure murale d'un instant dans un fuseau. */
export function wallClock(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}` as IsoDate,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Date locale « aujourd'hui » dans le fuseau du foyer. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  return wallClock(now, timeZone).date;
}

/** Décalage (ms) du fuseau par rapport à UTC à un instant donné. */
function offsetAt(instant: number, timeZone: string): number {
  const { date, minute, second } = wallClock(new Date(instant), timeZone);
  const { year, month, day } = parseIsoDate(date);
  const asUtc = Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60, second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Convertit une heure murale en instant UTC.
 * - Heure ambiguë (passage à l'heure d'hiver, 02:30 existe deux fois) : première occurrence.
 * - Heure inexistante (passage à l'heure d'été, 02:30 n'existe pas) : décalée de la durée du saut
 *   (02:30 → 03:30), comme le font Google Calendar et la plupart des agendas.
 */
export function zonedToUtc(date: IsoDate, minuteOfDay: number, timeZone: string): Date {
  const { year, month, day } = parseIsoDate(date);
  const naive = Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  // Deux candidats : avec le décalage d'avant et d'après une éventuelle transition.
  const before = offsetAt(naive - 86_400_000 / 2, timeZone);
  const after = offsetAt(naive + 86_400_000 / 2, timeZone);
  const candidates = [naive - before, naive - after].filter(
    (t) =>
      wallClock(new Date(t), timeZone).minute === minuteOfDay &&
      wallClock(new Date(t), timeZone).date === date,
  );
  if (candidates.length > 0) return new Date(Math.min(...candidates));
  // Heure inexistante : on applique le décalage d'avant la transition (→ heure décalée vers l'avant).
  return new Date(naive - before);
}

export function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
