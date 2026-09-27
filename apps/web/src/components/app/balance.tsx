'use client';

import { useTranslations } from 'next-intl';
import { formatDuration } from '@/lib/format';
import { useBalance } from '@/lib/tasks';
import { Skeleton } from '@/components/ui/states';
import { useSession } from './household-context';
import { cn } from '@/lib/cn';
import { MemberAvatar, memberBgClass } from './member-avatar';

/**
 * Répartition factuelle des tâches partagées de la semaine.
 * Volontairement neutre : même couleur pour tous, pas de classement ni de « gagnant ».
 */
export function Balance() {
  const t = useTranslations('balance');
  const { household } = useSession();
  const balance = useBalance(household.id);

  if (!balance.data) return <Skeleton className="h-28 w-full" />;
  const { members, together, unassigned } = balance.data;
  const rows = [
    ...members.map((m) => {
      const member = household.members.find((x) => x.id === m.memberId);
      return { key: m.memberId, label: member?.displayName ?? '—', avatar: member, ...m };
    }),
    {
      key: 'together',
      label: t(household.members.length === 2 ? 'bothOfUs' : 'together'),
      avatar: undefined,
      ...together,
    },
    { key: 'unassigned', label: t('unassigned'), avatar: undefined, ...unassigned },
  ];
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);

  if (total === 0) return <p className="text-[0.9375rem] text-text-muted">{t('empty')}</p>;

  return (
    <dl className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3">
          <dt className="flex items-center gap-2 truncate text-[0.9375rem]">
            {r.avatar ? (
              <MemberAvatar member={r.avatar} size="sm" />
            ) : (
              <span
                aria-hidden
                className="size-6 shrink-0 rounded-full border border-dashed border-text-muted"
              />
            )}
            <span className="truncate">{r.label}</span>
          </dt>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={cn(
                'h-full rounded-full',
                r.avatar ? memberBgClass(r.avatar.color) : 'bg-text-muted/50',
              )}
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <dd className="text-right text-[0.8125rem] tabular-nums text-text-muted">
            {t('count', { count: r.count })}
            {r.minutes > 0 && ` · ${formatDuration(r.minutes)}`}
          </dd>
        </div>
      ))}
    </dl>
  );
}
