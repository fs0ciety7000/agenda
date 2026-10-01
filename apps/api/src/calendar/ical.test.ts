import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeText, fold } from './ical';

describe('iCalendar', () => {
  it('échappe le texte', () => {
    expect(escapeText('a, b; c\\d\nsuite')).toBe('a\\, b\\; c\\\\d\\nsuite');
  });

  it('plie les lignes longues à 75 octets, sans couper un caractère', () => {
    const line = `SUMMARY:${'é'.repeat(60)}`;
    const folded = fold(line).split('\r\n ');
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(folded.join('')).toBe(line);
  });

  it('journée entière et horaire', () => {
    const ics = buildCalendar(
      'Tandem',
      [
        {
          uid: 'a@tandem',
          title: 'Changer les draps',
          date: '2026-10-03',
          updatedAt: new Date(0),
          sequence: 1,
        },
        {
          uid: 'b@tandem',
          title: 'Dentiste',
          start: new Date('2026-09-30T07:00:00Z'),
          end: new Date('2026-09-30T07:30:00Z'),
          updatedAt: new Date(0),
          sequence: 2,
          location: 'Rue X, 1',
        },
      ],
      new Date('2026-09-30T10:00:00Z'),
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20261003\r\nDTEND;VALUE=DATE:20261004');
    expect(ics).toContain('DTSTART:20260930T070000Z\r\nDTEND:20260930T073000Z');
    expect(ics).toContain('LOCATION:Rue X\\, 1');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
