'use client';

import { addDays, diffDays, formatMinute, todayIn } from '@agenda/domain';
import { useFormatter, useTranslations } from 'next-intl';
import { useSession } from '@/components/app/household-context';

/** « Aujourd'hui » dans le fuseau du foyer (et non celui du navigateur). */
export function useToday(): string {
  const { household } = useSession();
  return todayIn(household.timezone);
}

/** Libellés de jour relatifs : Aujourd'hui, Demain, Hier, puis « sam. 3 oct. ». */
export function useDayLabel() {
  const t = useTranslations('dates');
  const format = useFormatter();
  const today = useToday();
  return (date: string, style: 'short' | 'long' = 'short') => {
    const d = diffDays(today, date);
    if (d === 0) return t('today');
    if (d === 1) return t('tomorrow');
    if (d === -1) return t('yesterday');
    const value = new Date(`${date}T12:00:00Z`);
    return format.dateTime(value, {
      timeZone: 'UTC',
      weekday: style === 'long' ? 'long' : 'short',
      day: 'numeric',
      month: style === 'long' ? 'long' : 'short',
      year: value.getUTCFullYear() !== Number(today.slice(0, 4)) ? 'numeric' : undefined,
    });
  };
}

export const formatTime = formatMinute;
export { addDays };

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
