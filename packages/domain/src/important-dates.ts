import { daysInMonth, diffDays, formatIsoDate, type IsoDate, parseIsoDate } from './dates';

/**
 * Dates importantes (anniversaires, entretiens annuels…) : prochaine occurrence à partir
 * d'aujourd'hui. Un 29 février tombe le 28 les années non bissextiles. Une date unique (sans
 * répétition) passée n'a plus d'occurrence.
 */
export interface ImportantDateRule {
  month: number;
  day: number;
  /** Année d'origine (naissance, mariage…) ; obligatoire pour une date unique. */
  year?: number | null;
  repeatsYearly: boolean;
}

export interface NextOccurrence {
  date: IsoDate;
  daysLeft: number;
  /** Années écoulées à cette occurrence (âge, années de mariage), si l'année est connue. */
  years: number | null;
}

const onYear = (year: number, month: number, day: number): IsoDate =>
  formatIsoDate(year, month, Math.min(day, daysInMonth(year, month)));

export function nextOccurrence(rule: ImportantDateRule, today: IsoDate): NextOccurrence | null {
  const t = parseIsoDate(today);
  if (!rule.repeatsYearly) {
    if (rule.year == null) return null;
    const date = onYear(rule.year, rule.month, rule.day);
    const daysLeft = diffDays(today, date);
    return daysLeft < 0 ? null : { date, daysLeft, years: null };
  }
  let year = t.year;
  let date = onYear(year, rule.month, rule.day);
  if (diffDays(today, date) < 0) {
    year += 1;
    date = onYear(year, rule.month, rule.day);
  }
  const years = rule.year != null && rule.year <= year ? year - rule.year : null;
  return { date, daysLeft: diffDays(today, date), years };
}

/** Le rappel tombe-t-il aujourd'hui (ou est-il dû et pas encore envoyé) ? */
export function reminderDue(next: NextOccurrence, remindDaysBefore: number): boolean {
  return next.daysLeft <= remindDaysBefore;
}
