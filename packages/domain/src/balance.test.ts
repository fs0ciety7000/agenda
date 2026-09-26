import { describe, expect, it } from 'vitest';
import { suggestAssignee } from './balance';

describe('suggestion de répartition', () => {
  it('propose la personne la moins chargée (minutes + 15 min par tâche)', () => {
    expect(
      suggestAssignee([
        { memberId: 'g', count: 3, minutes: 90 },
        { memberId: 'n', count: 1, minutes: 30 },
      ]),
    ).toEqual({ memberId: 'n', minutes: 30, count: 1 });
  });

  it('une tâche sans durée compte quand même', () => {
    expect(
      suggestAssignee([
        { memberId: 'g', count: 4, minutes: 0 },
        { memberId: 'n', count: 0, minutes: 45 },
      ])?.memberId,
    ).toBe('n');
  });

  it('égalité ou personne seule : pas de suggestion', () => {
    expect(
      suggestAssignee([
        { memberId: 'g', count: 1, minutes: 30 },
        { memberId: 'n', count: 2, minutes: 15 },
      ]),
    ).toBeNull();
    expect(suggestAssignee([{ memberId: 'g', count: 0, minutes: 0 }])).toBeNull();
  });
});
