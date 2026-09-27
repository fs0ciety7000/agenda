import { describe, expect, it } from 'vitest';
import { expandSeries, type Rule } from './recurrence';
import {
  assigneesFor,
  coverAbsence,
  buildSlots,
  continuationOffset,
  describeSlots,
  type RotationAdvance,
  type RotationInput,
} from './rotation';

const G = 'grace';
const N = 'nicolas';

function planning(
  rule: Rule,
  startDate: string,
  to: string,
  input: RotationInput,
  advance: RotationAdvance = 'PER_OCCURRENCE',
  offset = 0,
) {
  const config = { slots: buildSlots(input), advance, offset };
  return expandSeries(rule, { startDate }, { from: startDate, to }).map((o) => [
    o.date,
    assigneesFor(o, config).join('+') || '—',
  ]);
}

describe('rotation Grace / Nicolas', () => {
  it('alternance simple : poubelles 2 fois par semaine (mardi + vendredi)', () => {
    expect(
      planning(
        { freq: 'WEEKLY', interval: 1, byWeekday: ['TU', 'FR'] },
        '2026-09-29',
        '2026-10-13',
        { mode: 'ALTERNATE', memberIds: [G, N] },
      ),
    ).toEqual([
      ['2026-09-29', G],
      ['2026-10-02', N],
      ['2026-10-06', G],
      ['2026-10-09', N],
      ['2026-10-13', G],
    ]);
  });

  it('alternance par semaine : salle de bain, semaine 1 → Grace, semaine 2 → Nicolas', () => {
    expect(
      planning(
        { freq: 'WEEKLY', interval: 1, byWeekday: ['SA'] },
        '2026-09-26',
        '2026-10-17',
        { mode: 'ALTERNATE', memberIds: [G, N] },
        'PER_WEEK',
      ),
    ).toEqual([
      ['2026-09-26', G],
      ['2026-10-03', N],
      ['2026-10-10', G],
      ['2026-10-17', N],
    ]);
  });

  it('par semaine + 2 fois par semaine : même personne toute la semaine', () => {
    expect(
      planning(
        { freq: 'WEEKLY', interval: 1, byWeekday: ['TU', 'FR'] },
        '2026-09-28',
        '2026-10-11',
        { mode: 'ALTERNATE', memberIds: [G, N] },
        'PER_WEEK',
      ),
    ).toEqual([
      ['2026-09-29', G],
      ['2026-10-02', G],
      ['2026-10-06', N],
      ['2026-10-09', N],
    ]);
  });

  it('attribution fixe (Grace) et à deux', () => {
    const rule: Rule = { freq: 'DAILY', interval: 1 };
    expect(
      planning(rule, '2026-09-26', '2026-09-27', { mode: 'FIXED', memberIds: [N] }).map(
        (r) => r[1],
      ),
    ).toEqual([N, N]);
    expect(
      planning(rule, '2026-09-26', '2026-09-27', { mode: 'TOGETHER', memberIds: [N, G] }).map(
        (r) => r[1],
      ),
    ).toEqual([`${G}+${N}`, `${G}+${N}`]);
    expect(
      planning(rule, '2026-09-26', '2026-09-27', { mode: 'UNASSIGNED' }).map((r) => r[1]),
    ).toEqual(['—', '—']);
  });

  it('rotation personnalisée : Grace, Grace, Nicolas, Nicolas', () => {
    expect(
      planning({ freq: 'DAILY', interval: 1 }, '2026-09-26', '2026-10-01', {
        mode: 'SEQUENCE',
        sequence: [[G], [G], [N], [N]],
      }).map((r) => r[1]),
    ).toEqual([G, G, N, N, G, G]);
  });

  it('rotation par jour : lundi → Nicolas, mercredi → Grace, samedi → alternance', () => {
    const input: RotationInput = {
      mode: 'WEEKDAY',
      days: [
        { weekday: 0, sequence: [[N]] },
        { weekday: 2, sequence: [[G]] },
        { weekday: 5, sequence: [[G], [N]] },
      ],
    };
    expect(
      planning(
        { freq: 'WEEKLY', interval: 1, byWeekday: ['MO', 'WE', 'SA'] },
        '2026-09-28',
        '2026-10-10',
        input,
      ),
    ).toEqual([
      ['2026-09-28', N],
      ['2026-09-30', G],
      ['2026-10-03', G],
      ['2026-10-05', N],
      ['2026-10-07', G],
      ['2026-10-10', N],
    ]);
  });

  it('rotation par jour : jour non configuré → rotation générale (fallback) ou personne', () => {
    const input: RotationInput = {
      mode: 'WEEKDAY',
      days: [{ weekday: 0, sequence: [[N]] }],
      fallback: [[G]],
    };
    expect(
      planning({ freq: 'DAILY', interval: 1 }, '2026-09-28', '2026-09-29', input).map((r) => r[1]),
    ).toEqual([N, G]);
    const noFallback: RotationInput = { mode: 'WEEKDAY', days: [{ weekday: 0, sequence: [[N]] }] };
    expect(
      planning({ freq: 'DAILY', interval: 1 }, '2026-09-28', '2026-09-29', noFallback).map(
        (r) => r[1],
      ),
    ).toEqual([N, '—']);
  });

  it('déterministe : recalculer donne le même planning', () => {
    const args = [
      { freq: 'DAILY', interval: 1 } as Rule,
      '2026-09-26',
      '2026-12-31',
      { mode: 'SEQUENCE', sequence: [[G], [N], [G, N]] } as RotationInput,
    ] as const;
    expect(planning(...args)).toEqual(planning(...args));
  });

  it('découpage de série : la nouvelle série reprend la rotation au bon tour', () => {
    const rule: Rule = { freq: 'WEEKLY', interval: 1, byWeekday: ['SA'] };
    const input: RotationInput = { mode: 'ALTERNATE', memberIds: [G, N] };
    const config = { slots: buildSlots(input), advance: 'PER_OCCURRENCE' as const, offset: 0 };
    const original = expandSeries(
      rule,
      { startDate: '2026-09-26' },
      { from: '2026-09-26', to: '2026-10-31' },
    );
    // On coupe au 3e samedi (10/10) : la nouvelle série démarre ce jour-là.
    const split = original[2]!;
    const offset = continuationOffset(split, config);
    const next = planning(rule, '2026-10-10', '2026-10-31', input, 'PER_OCCURRENCE', offset).map(
      (r) => r[1],
    );
    expect(next).toEqual(original.slice(2).map((o) => assigneesFor(o, config).join('+')));
  });
});

describe('slots ↔ saisie', () => {
  it.each<RotationInput>([
    { mode: 'UNASSIGNED' },
    { mode: 'FIXED', memberIds: [G] },
    { mode: 'TOGETHER', memberIds: [G, N] },
    { mode: 'ALTERNATE', memberIds: [N, G] },
    { mode: 'SEQUENCE', sequence: [[G], [G], [N], [N]] },
    {
      mode: 'WEEKDAY',
      days: [
        { weekday: 0, sequence: [[N]] },
        { weekday: 5, sequence: [[G], [N]] },
      ],
      fallback: [[G]],
    },
  ])('aller-retour %o', (input) => {
    expect(describeSlots(buildSlots(input), input.mode)).toEqual(input);
  });
});

describe('mode absence', () => {
  const all = ['g', 'n'];
  it('la tâche de l’absent passe à l’autre ; « à deux » garde le présent', () => {
    expect(coverAbsence(['g'], new Set(['g']), all)).toEqual(['n']);
    expect(coverAbsence(['g', 'n'], new Set(['g']), all)).toEqual(['n']);
    expect(coverAbsence(['n'], new Set(['g']), all)).toEqual(['n']);
    expect(coverAbsence([], new Set(['g']), all)).toEqual([]);
    // Tout le monde absent : inchangé.
    expect(coverAbsence(['g'], new Set(['g', 'n']), all)).toEqual(['g']);
  });
});
