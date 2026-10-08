import { addDays, type IsoDate } from './dates';

/**
 * Tableau « cette semaine » : qui fait quoi chaque jour, sur les 7 jours qui commencent
 * aujourd'hui. Une ligne par membre (tâches dont il est seul responsable), puis « à deux »
 * (plusieurs responsables) et « à définir » (aucun), affichées seulement si elles servent.
 * Mêmes règles que la répartition, sans total par personne : le tableau informe, il ne classe pas.
 */
export interface WeekBoardItem {
  id: string;
  date: IsoDate | null;
  status: string;
  assigneeIds: string[];
}

export type WeekBoardRowKey = string | 'together' | 'unassigned';

export interface WeekBoard<T extends WeekBoardItem> {
  days: IsoDate[];
  rows: { key: WeekBoardRowKey; cells: T[][] }[];
}

export function weekBoard<T extends WeekBoardItem>(
  items: T[],
  today: IsoDate,
  memberIds: string[],
): WeekBoard<T> {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const seen = new Set<string>();
  const kept = items.filter((o) => {
    if (!o.date || !days.includes(o.date) || o.status === 'CANCELLED' || o.status === 'SKIPPED')
      return false;
    // Une même occurrence peut venir de deux listes (aujourd'hui et la semaine).
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
  const keyOf = (o: T): WeekBoardRowKey =>
    o.assigneeIds.length === 0
      ? 'unassigned'
      : o.assigneeIds.length > 1
        ? 'together'
        : o.assigneeIds[0]!;
  const row = (key: WeekBoardRowKey) => ({
    key,
    cells: days.map((d) => kept.filter((o) => o.date === d && keyOf(o) === key)),
  });
  const extra = (['together', 'unassigned'] as const)
    .map(row)
    .filter((r) => r.cells.some((c) => c.length > 0));
  return { days, rows: [...memberIds.map(row), ...extra] };
}
