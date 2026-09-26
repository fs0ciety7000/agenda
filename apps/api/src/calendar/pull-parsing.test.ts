import { describe, expect, it } from 'vitest';
import { scheduleFromEvent, titleFromSummary } from './calendar-sync.service';

describe('sens Google → app : lecture des événements', () => {
  it('titre : retire « ✓ » et « · responsable » ajoutés par l’app', () => {
    expect(titleFromSummary('✓ Poubelles · Grace', ['Grace'])).toBe('Poubelles');
    expect(titleFromSummary('Courses · à deux', ['Grace', 'Nicolas'])).toBe('Courses');
    expect(titleFromSummary('Courses · together', ['Grace', 'Nicolas'])).toBe('Courses');
    expect(titleFromSummary('Appeler · Paul', ['Grace'])).toBe('Appeler · Paul');
    expect(titleFromSummary('  ', [])).toBeNull();
  });

  it('horaire : journée entière, heure locale du foyer, durée par défaut non inventée', () => {
    expect(
      scheduleFromEvent({ id: 'e', start: { date: '2026-10-01' } }, 'Europe/Brussels', 20),
    ).toEqual({
      date: '2026-10-01',
      startMinute: null,
      durationMinutes: 20,
    });
    const timed = {
      id: 'e',
      start: { dateTime: '2026-10-01T13:00:00Z' },
      end: { dateTime: '2026-10-01T13:30:00Z' },
    };
    // 13:00 UTC = 15:00 à Bruxelles (heure d'été) ; 30 min = valeur publiée par défaut.
    expect(scheduleFromEvent(timed, 'Europe/Brussels', null)).toEqual({
      date: '2026-10-01',
      startMinute: 15 * 60,
      durationMinutes: null,
    });
    expect(scheduleFromEvent(timed, 'Europe/Brussels', 45)?.durationMinutes).toBe(30);
    expect(scheduleFromEvent({ id: 'e' }, 'Europe/Brussels', null)).toBeNull();
  });
});
