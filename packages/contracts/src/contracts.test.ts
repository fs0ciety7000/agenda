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

describe('tâches', async () => {
  const { CreateTaskInput, UpdateOccurrenceInput, OccurrenceQuery } = await import('./tasks');

  it('titre seul suffit (création en quelques secondes)', () => {
    expect(CreateTaskInput.parse({ title: ' Sortir les poubelles ' })).toEqual({
      title: 'Sortir les poubelles',
      priority: 'NORMAL',
      visibility: 'SHARED',
      assigneeIds: [],
    });
  });

  it('une heure exige une date ; dates impossibles refusées', () => {
    expect(CreateTaskInput.safeParse({ title: 'x', startMinute: 600 }).success).toBe(false);
    expect(CreateTaskInput.safeParse({ title: 'x', date: '2026-02-30' }).success).toBe(false);
    expect(
      CreateTaskInput.safeParse({ title: 'x', date: '2026-09-26', startMinute: 1440 }).success,
    ).toBe(false);
  });

  it('modification : version obligatoire', () => {
    expect(UpdateOccurrenceInput.safeParse({ title: 'x' }).success).toBe(false);
    expect(UpdateOccurrenceInput.parse({ version: 2, date: null })).toEqual({
      version: 2,
      date: null,
    });
  });

  it('filtres : valeurs spéciales de responsable', () => {
    expect(OccurrenceQuery.parse({ assignee: 'together' }).view).toBe('all');
    expect(OccurrenceQuery.safeParse({ assignee: 'grace' }).success).toBe(false);
  });
});

describe('récurrence & rotation', async () => {
  const { CreateTaskInput, RecurrenceInput } = await import('./index');
  const G = '00000000-0000-4000-8000-000000000001';

  it('valeurs par défaut : non attribuée, avance par occurrence', () => {
    expect(RecurrenceInput.parse({ rule: { freq: 'WEEKLY', byWeekday: ['SA'] } })).toMatchObject({
      rotation: { mode: 'UNASSIGNED' },
      advance: 'PER_OCCURRENCE',
    });
  });

  it('une tâche récurrente exige une date de début', () => {
    const recurrence = { rule: { freq: 'DAILY' } };
    expect(CreateTaskInput.safeParse({ title: 'x', recurrence }).success).toBe(false);
    expect(CreateTaskInput.safeParse({ title: 'x', recurrence, date: '2026-09-26' }).success).toBe(
      true,
    );
  });

  it('jours ouvrés : intervalle 1 uniquement ; alternance : au moins 2 membres', () => {
    expect(
      RecurrenceInput.safeParse({ rule: { freq: 'DAILY', interval: 2, weekdaysOnly: true } })
        .success,
    ).toBe(false);
    expect(
      RecurrenceInput.safeParse({
        rule: { freq: 'DAILY' },
        rotation: { mode: 'ALTERNATE', memberIds: [G] },
      }).success,
    ).toBe(false);
  });
});
