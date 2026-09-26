/**
 * Suggestion de répartition : quand personne n'est choisi pour une tâche partagée, proposer la
 * personne la moins chargée de la semaine (tâches partagées uniquement, comme la répartition).
 * Charge = minutes prévues + 15 min par tâche (une tâche sans durée compte quand même).
 * Les tâches « à deux » chargent tout le monde pareil : elles ne changent pas l'ordre.
 * Égalité → pas de suggestion (aucun choix arbitraire).
 */
export interface MemberLoad {
  memberId: string;
  count: number;
  minutes: number;
}

export const TASK_WEIGHT_MINUTES = 15;

export const loadOf = (l: MemberLoad) => l.minutes + l.count * TASK_WEIGHT_MINUTES;

export function suggestAssignee(
  loads: MemberLoad[],
): { memberId: string; minutes: number; count: number } | null {
  if (loads.length < 2) return null;
  const sorted = [...loads].sort((a, b) => loadOf(a) - loadOf(b));
  const best = sorted[0]!;
  const next = sorted[1]!;
  if (loadOf(best) === loadOf(next)) return null;
  return { memberId: best.memberId, minutes: best.minutes, count: best.count };
}
