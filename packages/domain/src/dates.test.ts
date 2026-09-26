import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatMinute,
  isValidIsoDate,
  startOfWeek,
  todayIn,
  wallClock,
  weekdayOf,
  zonedToUtc,
} from './dates';

const BXL = 'Europe/Brussels';

describe('dates locales', () => {
  it('ajoute des jours en traversant mois, années et 29 février', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-09-26', '2026-10-03')).toBe(7);
  });

  it('jour de semaine ISO (0 = lundi) et début de semaine', () => {
    expect(weekdayOf('2026-09-26')).toBe(5); // samedi
    expect(weekdayOf('2026-09-28')).toBe(0); // lundi
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
  });

  it('valide les dates', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('26-9-1')).toBe(false);
  });

  it('formate les minutes', () => {
    expect(formatMinute(0)).toBe('00:00');
    expect(formatMinute(19 * 60 + 5)).toBe('19:05');
  });
});

describe('fuseaux horaires (Europe/Brussels)', () => {
  it("« aujourd'hui » dépend du fuseau, pas d'UTC", () => {
    // 23:30 UTC le 26/09 = 01:30 le 27/09 à Bruxelles (UTC+2)
    expect(todayIn(BXL, new Date('2026-09-26T23:30:00Z'))).toBe('2026-09-27');
    expect(todayIn('UTC', new Date('2026-09-26T23:30:00Z'))).toBe('2026-09-26');
  });

  it('samedi 10:00 reste 10:00 en été (UTC+2) comme en hiver (UTC+1)', () => {
    expect(zonedToUtc('2026-09-26', 600, BXL).toISOString()).toBe('2026-09-26T08:00:00.000Z');
    expect(zonedToUtc('2026-12-05', 600, BXL).toISOString()).toBe('2026-12-05T09:00:00.000Z');
  });

  it("jour du passage à l'heure d'été (29/03/2026) : 02:30 n'existe pas → 03:30", () => {
    expect(zonedToUtc('2026-03-29', 90, BXL).toISOString()).toBe('2026-03-29T00:30:00.000Z'); // 01:30 CET
    const skipped = zonedToUtc('2026-03-29', 150, BXL);
    expect(wallClock(skipped, BXL)).toMatchObject({ date: '2026-03-29', minute: 210 });
    expect(zonedToUtc('2026-03-29', 600, BXL).toISOString()).toBe('2026-03-29T08:00:00.000Z'); // 10:00 CEST
  });

  it("jour du passage à l'heure d'hiver (25/10/2026) : 02:30 ambiguë → première occurrence", () => {
    expect(zonedToUtc('2026-10-25', 150, BXL).toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(zonedToUtc('2026-10-25', 600, BXL).toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });

  it('minuit et 23:59 restent le bon jour', () => {
    const midnight = zonedToUtc('2026-09-26', 0, BXL);
    expect(midnight.toISOString()).toBe('2026-09-25T22:00:00.000Z');
    expect(wallClock(midnight, BXL)).toMatchObject({ date: '2026-09-26', minute: 0 });
    expect(wallClock(zonedToUtc('2026-09-26', 1439, BXL), BXL)).toMatchObject({
      date: '2026-09-26',
      minute: 1439,
    });
  });

  it('fonctionne pour un fuseau à décalage non horaire', () => {
    expect(zonedToUtc('2026-09-26', 600, 'Asia/Kolkata').toISOString()).toBe(
      '2026-09-26T04:30:00.000Z',
    );
  });
});
