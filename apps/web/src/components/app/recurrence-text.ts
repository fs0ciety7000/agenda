'use client';

import type { HouseholdDto, RecurrenceRule, RotationInput } from '@agenda/contracts';
import { useFormatter, useTranslations } from 'next-intl';
import { WEEKDAYS } from '@/lib/recurrence';

/** Nom de jour localisé (0 = lundi), via Intl (lundi 5 janvier 2026 comme référence). */
export function useWeekdayName() {
  const format = useFormatter();
  return (weekday: number, style: 'long' | 'short' | 'narrow' = 'long') =>
    format.dateTime(new Date(Date.UTC(2026, 0, 5 + weekday, 12)), {
      weekday: style,
      timeZone: 'UTC',
    });
}

/** « Chaque semaine le samedi », « Tous les 3 mois le 15 », « Le dernier jour de chaque mois »… */
export function useRuleText() {
  const t = useTranslations('recurrence.summary');
  const dayName = useWeekdayName();
  const list = useFormatter();
  return (rule: RecurrenceRule) => {
    switch (rule.freq) {
      case 'DAILY':
        return rule.weekdaysOnly ? t('weekdays') : t('daily', { n: rule.interval });
      case 'WEEKLY':
        return t('weekly', {
          n: rule.interval,
          days: list.list(
            [...rule.byWeekday]
              .sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
              .map((w) => dayName(WEEKDAYS.indexOf(w))),
            { type: 'conjunction' },
          ),
        });
      case 'MONTHLY':
        return rule.byMonthDay === -1
          ? t('monthlyLast', { n: rule.interval })
          : t('monthly', { n: rule.interval, day: rule.byMonthDay });
      case 'YEARLY':
        return t('yearly', { n: rule.interval });
    }
  };
}

export function useRotationText(household: HouseholdDto) {
  const t = useTranslations('recurrence.rotationSummary');
  const format = useFormatter();
  const name = (id: string) => household.members.find((m) => m.id === id)?.displayName ?? '—';
  const names = (ids: string[]) => format.list(ids.map(name), { type: 'conjunction' });
  return (r: RotationInput) => {
    switch (r.mode) {
      case 'UNASSIGNED':
        return t('unassigned');
      case 'FIXED':
        return r.memberIds.length > 1
          ? t('together', { names: names(r.memberIds) })
          : t('fixed', { name: name(r.memberIds[0]!) });
      case 'TOGETHER':
        return t('together', { names: names(r.memberIds) });
      case 'ALTERNATE':
        return t('alternate', { names: r.memberIds.map(name).join(' → ') });
      case 'SEQUENCE':
        return t('sequence', {
          steps: r.sequence.map((ids) => ids.map(name).join(' + ')).join(', '),
        });
      case 'WEEKDAY':
        return t('weekday');
    }
  };
}
