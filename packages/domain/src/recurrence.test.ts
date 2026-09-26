import { describe, expect, it } from 'vitest';
import { expandSeries, firstOccurrence, iterateSeries, type Rule } from './recurrence';

const dates = (
  rule: Rule,
  startDate: string,
  to: string,
  extra: { untilDate?: string; count?: number } = {},
) => expandSeries(rule, { startDate, ...extra }, { from: startDate, to }).map((o) => o.date);

describe('récurrence — fréquences', () => {
  it('tous les jours', () => {
    expect(dates({ freq: 'DAILY', interval: 1 }, '2026-09-26', '2026-09-30')).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ]);
  });

  it('tous les 3 jours', () => {
    expect(dates({ freq: 'DAILY', interval: 3 }, '2026-09-26', '2026-10-05')).toEqual([
      '2026-09-26',
      '2026-09-29',
      '2026-10-02',
      '2026-10-05',
    ]);
  });

  it('jours ouvrés (samedi de départ ignoré)', () => {
    expect(
      dates({ freq: 'DAILY', interval: 1, weekdaysOnly: true }, '2026-09-26', '2026-10-03'),
    ).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('chaque samedi (exemple du cahier des charges)', () => {
    expect(
      dates({ freq: 'WEEKLY', interval: 1, byWeekday: ['SA'] }, '2026-09-26', '2026-10-17'),
    ).toEqual(['2026-09-26', '2026-10-03', '2026-10-10', '2026-10-17']);
  });

  it('2 fois par semaine (mardi + vendredi), départ un mercredi', () => {
    expect(
      dates({ freq: 'WEEKLY', interval: 1, byWeekday: ['FR', 'TU'] }, '2026-09-30', '2026-10-13'),
    ).toEqual(['2026-10-02', '2026-10-06', '2026-10-09', '2026-10-13']);
  });

  it('toutes les 2 semaines, alignées sur la semaine de départ', () => {
    expect(
      dates({ freq: 'WEEKLY', interval: 2, byWeekday: ['MO'] }, '2026-09-30', '2026-11-01'),
    ).toEqual([
      '2026-10-12', // la semaine du départ (lundi 28/09) est passée : semaine +2
      '2026-10-26',
    ]);
  });

  it('tous les mois le 15 ; tous les 3 mois', () => {
    expect(
      dates({ freq: 'MONTHLY', interval: 1, byMonthDay: 15 }, '2026-09-26', '2026-12-31'),
    ).toEqual(['2026-10-15', '2026-11-15', '2026-12-15']);
    expect(
      dates({ freq: 'MONTHLY', interval: 3, byMonthDay: 1 }, '2026-09-01', '2027-06-30'),
    ).toEqual(['2026-09-01', '2026-12-01', '2027-03-01', '2027-06-01']);
  });

  it('dernier jour du mois (février bissextile ou non)', () => {
    expect(
      dates({ freq: 'MONTHLY', interval: 1, byMonthDay: -1 }, '2027-12-01', '2028-04-30'),
    ).toEqual(['2027-12-31', '2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
  });

  it('le 31 : les mois sans 31 sont ignorés (RFC 5545)', () => {
    expect(
      dates({ freq: 'MONTHLY', interval: 1, byMonthDay: 31 }, '2026-09-01', '2027-01-31'),
    ).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']);
  });

  it('tous les ans, y compris le 29 février (années bissextiles seulement)', () => {
    expect(dates({ freq: 'YEARLY', interval: 1 }, '2026-12-24', '2028-12-31')).toEqual([
      '2026-12-24',
      '2027-12-24',
      '2028-12-24',
    ]);
    expect(dates({ freq: 'YEARLY', interval: 1 }, '2028-02-29', '2036-12-31')).toEqual([
      '2028-02-29',
      '2032-02-29',
      '2036-02-29',
    ]);
  });
});

describe('récurrence — bornes et indices', () => {
  it('date de fin incluse', () => {
    expect(
      dates({ freq: 'DAILY', interval: 1 }, '2026-09-26', '2027-01-01', {
        untilDate: '2026-09-28',
      }),
    ).toHaveLength(3);
  });

  it('nombre d’occurrences', () => {
    expect(
      dates({ freq: 'WEEKLY', interval: 1, byWeekday: ['SA'] }, '2026-09-26', '2030-01-01', {
        count: 3,
      }),
    ).toEqual(['2026-09-26', '2026-10-03', '2026-10-10']);
  });

  it('fenêtre au milieu de la série : indices globaux conservés', () => {
    const occs = expandSeries(
      { freq: 'DAILY', interval: 1 },
      { startDate: '2026-09-01' },
      { from: '2026-09-10', to: '2026-09-11' },
    );
    expect(occs.map((o) => o.index)).toEqual([9, 10]);
  });

  it('indices par jour de semaine et par semaine', () => {
    const occs = [
      ...iterateSeries(
        { freq: 'WEEKLY', interval: 1, byWeekday: ['MO', 'WE'] },
        { startDate: '2026-09-28', count: 5 },
      ),
    ];
    expect(occs.map((o) => [o.date, o.index, o.weekdayIndex, o.weekIndex])).toEqual([
      ['2026-09-28', 0, 0, 0],
      ['2026-09-30', 1, 0, 0],
      ['2026-10-05', 2, 1, 1],
      ['2026-10-07', 3, 1, 1],
      ['2026-10-12', 4, 2, 2],
    ]);
  });

  it('règle qui ne produit jamais de date : pas de boucle infinie', () => {
    expect(
      dates({ freq: 'MONTHLY', interval: 12, byMonthDay: 30 }, '2026-02-01', '2040-01-01'),
    ).toEqual([]);
  });

  it('première occurrence', () => {
    expect(
      firstOccurrence(
        { freq: 'WEEKLY', interval: 1, byWeekday: ['SA'] },
        { startDate: '2026-09-28' },
      ),
    ).toBe('2026-10-03');
  });

  it('série longue : 10 ans quotidiens en quelques ms', () => {
    const t = performance.now();
    const occs = expandSeries(
      { freq: 'DAILY', interval: 1 },
      { startDate: '2016-01-01' },
      { from: '2026-01-01', to: '2026-12-31' },
    );
    expect(occs).toHaveLength(365);
    expect(performance.now() - t).toBeLessThan(500);
  });
});
