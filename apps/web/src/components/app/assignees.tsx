'use client';

import type { HouseholdDto } from '@agenda/contracts';
import { useTranslations } from 'next-intl';
import { MemberAvatar } from './member-avatar';

/** « Nicolas », « Tous les deux », « À définir » — avec avatars (jamais la couleur seule). */
export function useAssigneeLabel(household: HouseholdDto) {
  const t = useTranslations('tasks');
  return (ids: string[]) => {
    if (ids.length === 0) return t('unassigned');
    if (ids.length === household.members.length && ids.length === 2) return t('bothOfUs');
    return ids
      .map((id) => household.members.find((m) => m.id === id)?.displayName)
      .filter(Boolean)
      .join(', ');
  };
}

export function AssigneeAvatars({ household, ids }: { household: HouseholdDto; ids: string[] }) {
  if (ids.length === 0) {
    return (
      <span
        aria-hidden
        className="inline-block size-5 rounded-full border border-dashed border-text-muted"
      />
    );
  }
  return (
    <span aria-hidden className="inline-flex -space-x-1.5">
      {ids.map((id) => {
        const member = household.members.find((m) => m.id === id);
        return member ? <MemberAvatar key={id} member={member} size="xs" /> : null;
      })}
    </span>
  );
}
