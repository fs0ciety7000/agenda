import { weekdayOf } from './dates';
import type { GeneratedOccurrence } from './recurrence';

/**
 * Rotation des responsables. Représentation unique en « slots » (table RotationSlot) :
 *   (weekday, position, memberId) — weekday null = tous les jours ; plusieurs membres à la même
 *   position = « à deux » pour ce tour.
 * Le résultat est DÉTERMINISTE : même série ⇒ mêmes responsables (les occurrences modifiées à la main
 * sont des exceptions et ne sont jamais recalculées).
 */
export interface RotationSlot {
  weekday: number | null; // 0 = lundi … 6 = dimanche
  position: number;
  memberId: string;
}

export type RotationAdvance = 'PER_OCCURRENCE' | 'PER_WEEK';

export interface RotationConfig {
  slots: RotationSlot[];
  advance: RotationAdvance;
  /** Décalage appliqué au compteur (continuité après un découpage de série). */
  offset: number;
}

/** Modes proposés dans l'interface ; convertis en slots. */
export type RotationInput =
  | { mode: 'UNASSIGNED' }
  | { mode: 'FIXED'; memberIds: string[] } // 1 membre = assignée, plusieurs = toujours ensemble
  | { mode: 'TOGETHER'; memberIds: string[] }
  | { mode: 'ALTERNATE'; memberIds: string[] } // chacun son tour, dans l'ordre
  | { mode: 'SEQUENCE'; sequence: string[][] } // ex. [[G],[G],[N],[N]]
  | { mode: 'WEEKDAY'; days: { weekday: number; sequence: string[][] }[]; fallback?: string[][] };

export type RotationMode = RotationInput['mode'];

const mod = (a: number, n: number) => ((a % n) + n) % n;

function sequenceSlots(sequence: string[][], weekday: number | null): RotationSlot[] {
  return sequence.flatMap((members, position) =>
    [...new Set(members)].map((memberId) => ({ weekday, position, memberId })),
  );
}

export function buildSlots(input: RotationInput): RotationSlot[] {
  switch (input.mode) {
    case 'UNASSIGNED':
      return [];
    case 'FIXED':
    case 'TOGETHER':
      return sequenceSlots([input.memberIds], null);
    case 'ALTERNATE':
      return sequenceSlots(
        input.memberIds.map((id) => [id]),
        null,
      );
    case 'SEQUENCE':
      return sequenceSlots(input.sequence, null);
    case 'WEEKDAY':
      return [
        ...input.days.flatMap((d) => sequenceSlots(d.sequence, d.weekday)),
        ...(input.fallback ? sequenceSlots(input.fallback, null) : []),
      ];
  }
}

function toSequence(slots: RotationSlot[]): string[][] {
  const byPosition = new Map<number, string[]>();
  for (const s of slots)
    byPosition.set(s.position, [...(byPosition.get(s.position) ?? []), s.memberId]);
  return [...byPosition.entries()].sort(([a], [b]) => a - b).map(([, ids]) => ids.sort());
}

/** Reconstitue la saisie d'origine à partir des slots (pour pré-remplir le formulaire). */
export function describeSlots(slots: RotationSlot[], mode: RotationMode): RotationInput {
  const general = slots.filter((s) => s.weekday === null);
  const sequence = toSequence(general);
  switch (mode) {
    case 'UNASSIGNED':
      return { mode };
    case 'FIXED':
    case 'TOGETHER':
      return { mode, memberIds: sequence[0] ?? [] };
    case 'ALTERNATE':
      return { mode, memberIds: sequence.map((s) => s[0]!).filter(Boolean) };
    case 'SEQUENCE':
      return { mode, sequence };
    case 'WEEKDAY': {
      const weekdays = [
        ...new Set(slots.map((s) => s.weekday).filter((w): w is number => w !== null)),
      ].sort();
      return {
        mode,
        days: weekdays.map((weekday) => ({
          weekday,
          sequence: toSequence(slots.filter((s) => s.weekday === weekday)),
        })),
        ...(sequence.length ? { fallback: sequence } : {}),
      };
    }
  }
}

/** Responsables d'une occurrence générée. */
export function assigneesFor(occ: GeneratedOccurrence, config: RotationConfig): string[] {
  const weekday = weekdayOf(occ.date);
  const daySlots = config.slots.filter((s) => s.weekday === weekday);
  const slots = daySlots.length ? daySlots : config.slots.filter((s) => s.weekday === null);
  if (!slots.length) return [];

  const sequence = toSequence(slots);
  const counter =
    config.advance === 'PER_WEEK' ? occ.weekIndex : daySlots.length ? occ.weekdayIndex : occ.index;
  return sequence[mod(counter + config.offset, sequence.length)]!;
}

/**
 * Décalage à donner à une nouvelle série (« cette occurrence et les suivantes ») pour que la rotation
 * reprenne exactement là où elle en était.
 */
export function continuationOffset(occ: GeneratedOccurrence, config: RotationConfig): number {
  const counter = config.advance === 'PER_WEEK' ? occ.weekIndex : occ.index;
  return counter + config.offset;
}
