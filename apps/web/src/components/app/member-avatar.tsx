import type { HouseholdMemberDto } from '@agenda/contracts';
import { cn } from '@/lib/cn';

const COLOR_CLASS: Record<HouseholdMemberDto['color'], string> = {
  sage: 'bg-member-sage',
  ocean: 'bg-member-ocean',
  amber: 'bg-member-amber',
  plum: 'bg-member-plum',
  clay: 'bg-member-clay',
  slate: 'bg-member-slate',
};

/** Fond de la couleur d'un membre (barres, pastilles). */
export const memberBgClass = (color: HouseholdMemberDto['color']) => COLOR_CLASS[color];

/** Couleur + initiale : l'information n'est jamais portée par la couleur seule. */
export function MemberAvatar({
  member,
  size = 'md',
}: {
  member: HouseholdMemberDto;
  size?: 'xs' | 'sm' | 'md';
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white',
        COLOR_CLASS[member.color],
        size === 'xs'
          ? 'size-5 text-[0.625rem] ring-2 ring-surface'
          : size === 'sm'
            ? 'size-6 text-xs'
            : 'size-8 text-sm',
      )}
    >
      {member.displayName.slice(0, 1).toUpperCase()}
    </span>
  );
}
