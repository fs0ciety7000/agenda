import { describe, expect, it } from 'vitest';
import { CreateHouseholdInput, RecurrenceRule, RegisterInput } from './index';

describe('contracts', () => {
  it('normalise email', () => {
    const r = RegisterInput.parse({
      email: '  Grace@Example.COM ',
      password: 'x'.repeat(10),
      displayName: 'Grace',
    });
    expect(r.email).toBe('grace@example.com');
    expect(r.locale).toBe('fr');
  });

  it('refuse un mot de passe trop court', () => {
    expect(
      RegisterInput.safeParse({ email: 'a@b.be', password: 'short', displayName: 'A' }).success,
    ).toBe(false);
  });

  it('valide le fuseau horaire IANA', () => {
    expect(CreateHouseholdInput.parse({ name: 'G & N' }).timezone).toBe('Europe/Brussels');
    expect(CreateHouseholdInput.safeParse({ name: 'x', timezone: 'Mars/Olympus' }).success).toBe(
      false,
    );
  });

  it('accepte « dernier jour du mois » et refuse le jour 0', () => {
    expect(RecurrenceRule.safeParse({ freq: 'MONTHLY', byMonthDay: -1 }).success).toBe(true);
    expect(RecurrenceRule.safeParse({ freq: 'MONTHLY', byMonthDay: 0 }).success).toBe(false);
  });

  it('exige au moins un jour pour WEEKLY', () => {
    expect(RecurrenceRule.safeParse({ freq: 'WEEKLY', byWeekday: [] }).success).toBe(false);
    expect(RecurrenceRule.parse({ freq: 'WEEKLY', byWeekday: ['SA'] })).toEqual({
      freq: 'WEEKLY',
      interval: 1,
      byWeekday: ['SA'],
    });
  });
});
