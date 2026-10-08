import { describe, expect, it } from 'vitest';
import { weekBoard } from './week-board';

const G = 'grace';
const N = 'nicolas';
const occ = (id: string, date: string | null, assigneeIds: string[], status = 'TODO') => ({
  id,
  date,
  status,
  assigneeIds,
});

describe('tableau « cette semaine »', () => {
  it('7 jours à partir d’aujourd’hui, une ligne par membre, à deux et à définir si utiles', () => {
    const board = weekBoard(
      [
        occ('a', '2026-10-08', [G]),
        occ('b', '2026-10-08', [G], 'DONE'),
        occ('c', '2026-10-10', [N]),
        occ('d', '2026-10-14', [G, N]),
        occ('e', '2026-10-15', [G]), // hors des 7 jours
        occ('f', null, [G]), // sans date
        occ('g', '2026-10-09', [N], 'CANCELLED'),
      ],
      '2026-10-08',
      [G, N],
    );
    expect(board.days).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
    expect(board.rows.map((r) => r.key)).toEqual([G, N, 'together']);
    const ids = (k: string) =>
      board.rows.find((r) => r.key === k)!.cells.map((c) => c.map((o) => o.id));
    expect(ids(G)).toEqual([['a', 'b'], [], [], [], [], [], []]);
    expect(ids(N)).toEqual([[], [], ['c'], [], [], [], []]);
    expect(ids('together')).toEqual([[], [], [], [], [], [], ['d']]);
  });

  it('sans doublon quand une occurrence vient de deux listes ; à définir en dernier', () => {
    const a = occ('a', '2026-10-08', []);
    const board = weekBoard([a, a], '2026-10-08', [G]);
    expect(board.rows.map((r) => r.key)).toEqual([G, 'unassigned']);
    expect(board.rows[1]!.cells[0]).toHaveLength(1);
  });
});
