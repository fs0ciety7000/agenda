import { describe, expect, it } from 'vitest';
import { nextOccurrence, reminderDue } from './important-dates';

describe('dates importantes', () => {
  it('chaque année : cette année si pas encore passée, sinon l’an prochain, avec l’âge', () => {
    const birthday = { month: 10, day: 14, year: 1990, repeatsYearly: true };
    expect(nextOccurrence(birthday, '2026-10-08')).toEqual({
      date: '2026-10-14',
      daysLeft: 6,
      years: 36,
    });
    expect(nextOccurrence(birthday, '2026-10-14')).toMatchObject({ daysLeft: 0, years: 36 });
    expect(nextOccurrence(birthday, '2026-10-15')).toEqual({
      date: '2027-10-14',
      daysLeft: 364,
      years: 37,
    });
  });

  it('29 février : le 28 les années non bissextiles ; année inconnue : pas d’âge', () => {
    expect(nextOccurrence({ month: 2, day: 29, repeatsYearly: true }, '2027-01-10')).toEqual({
      date: '2027-02-28',
      daysLeft: 49,
      years: null,
    });
    expect(nextOccurrence({ month: 2, day: 29, repeatsYearly: true }, '2028-02-01')).toMatchObject({
      date: '2028-02-29',
    });
  });

  it('date unique : à venir, puis plus rien une fois passée', () => {
    const once = { month: 11, day: 3, year: 2026, repeatsYearly: false };
    expect(nextOccurrence(once, '2026-10-08')).toEqual({
      date: '2026-11-03',
      daysLeft: 26,
      years: null,
    });
    expect(nextOccurrence(once, '2026-11-04')).toBeNull();
    expect(nextOccurrence({ month: 11, day: 3, repeatsYearly: false }, '2026-10-08')).toBeNull();
  });

  it('rappel dû N jours avant (0 = le jour même)', () => {
    const next = { date: '2026-10-14', daysLeft: 6, years: null };
    expect(reminderDue(next, 7)).toBe(true);
    expect(reminderDue(next, 5)).toBe(false);
    expect(reminderDue({ ...next, daysLeft: 0 }, 0)).toBe(true);
  });
});
