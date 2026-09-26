import { addDays, zonedToUtc } from '@agenda/domain';
import { toDbDate } from '../common/dates';

export interface Schedule {
  date: string | null;
  startMinute: number | null;
  durationMinutes: number | null;
}

/** Colonnes d'horaire d'une occurrence ; `startsAt`/`endsAt` en UTC via le fuseau du foyer. */
export function scheduleColumns(s: Schedule, tz: string) {
  if (!s.date) {
    return {
      date: null,
      startMinute: null,
      durationMinutes: s.durationMinutes,
      allDay: false,
      startsAt: null,
      endsAt: null,
    };
  }
  if (s.startMinute == null) {
    return {
      date: toDbDate(s.date),
      startMinute: null,
      durationMinutes: s.durationMinutes,
      allDay: true,
      startsAt: zonedToUtc(s.date, 0, tz),
      endsAt: zonedToUtc(addDays(s.date, 1), 0, tz),
    };
  }
  const startsAt = zonedToUtc(s.date, s.startMinute, tz);
  return {
    date: toDbDate(s.date),
    startMinute: s.startMinute,
    durationMinutes: s.durationMinutes,
    allDay: false,
    startsAt,
    endsAt: new Date(startsAt.getTime() + (s.durationMinutes ?? 0) * 60_000),
  };
}
