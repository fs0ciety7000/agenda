'use client';

import {
  BarChart3,
  Cake,
  ChevronRight,
  CircleHelp,
  History,
  type LucideIcon,
  Settings,
  ShieldUser,
  Sparkles,
  StickyNote,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import type { HouseholdMemberDto } from '@agenda/contracts';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { MemberAvatar } from './member-avatar';

/** Pages sans place dans la barre du bas (mobile) : tiroir « Plus » et page `/more`. */
export const MORE_LINKS: {
  href: string;
  key:
    | 'expenses'
    | 'notes'
    | 'dates'
    | 'meals'
    | 'stats'
    | 'review'
    | 'history'
    | 'help'
    | 'admin'
    | 'settings';
  icon: LucideIcon;
  /** Réservé aux administrateurs (ADMIN_EMAILS). */
  adminOnly?: true;
}[] = [
  { href: '/expenses', key: 'expenses', icon: Wallet },
  { href: '/notes', key: 'notes', icon: StickyNote },
  { href: '/dates', key: 'dates', icon: Cake },
  { href: '/meals', key: 'meals', icon: UtensilsCrossed },
  { href: '/stats', key: 'stats', icon: BarChart3 },
  { href: '/review', key: 'review', icon: Sparkles },
  { href: '/history', key: 'history', icon: History },
  { href: '/help', key: 'help', icon: CircleHelp },
  { href: '/admin', key: 'admin', icon: ShieldUser, adminOnly: true },
  { href: '/settings', key: 'settings', icon: Settings },
];

const BIG = ['expenses', 'dates'] as const;

/**
 * Grille des autres pages (refonte « Duo ») : deux grandes tuiles (Dépenses, Dates), les autres
 * en petites tuiles (Administration pour l'admin seulement), et Réglages en dernier, sur une
 * ligne avec les membres du foyer.
 */
export function MoreGrid({
  pathname,
  members,
  admin = false,
  onNavigate,
}: {
  pathname: string;
  /** Membres du foyer (pastilles de la ligne Réglages). */
  members: HouseholdMemberDto[];
  /** Compte administrateur : ajoute la tuile Administration. */
  admin?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations('more');
  const links = MORE_LINKS.filter((l) => l.key !== 'settings' && (admin || !l.adminOnly));
  const tile = (active: boolean) =>
    cn(
      'flex rounded-lg bg-surface-muted text-text transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      active && 'ring-2 ring-accent',
    );
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-3">
        {links
          .filter((l) => (BIG as readonly string[]).includes(l.key))
          .map(({ href, key, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={t(`${key}.title`)}
                  aria-describedby={`more-${key}-hint`}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(tile(active), 'min-h-32 flex-col justify-between gap-3 p-4')}
                >
                  <Icon aria-hidden className="size-6 stroke-[1.5]" />
                  <span className="flex flex-col gap-0.5">
                    <span className="break-words font-semibold">{t(`${key}.title`)}</span>
                    <span id={`more-${key}-hint`} className="text-[0.8125rem] text-text-muted">
                      {t(`${key}.hint`)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
      </ul>
      <ul className="grid grid-cols-2 gap-3 min-[360px]:grid-cols-3">
        {links
          .filter((l) => !(BIG as readonly string[]).includes(l.key))
          .map(({ href, key, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(
                    tile(active),
                    'min-h-24 flex-col items-center justify-center gap-2 px-2 py-3 text-center text-sm font-medium',
                  )}
                >
                  <Icon aria-hidden className="size-6 stroke-[1.5]" />
                  <span className="break-words">{t(`${key}.title`)}</span>
                </Link>
              </li>
            );
          })}
      </ul>
      <Link
        href="/settings"
        aria-label={t('settings.title')}
        aria-describedby="more-settings-hint"
        aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
        onClick={onNavigate}
        className="mt-1 flex min-h-16 items-center gap-3.5 border-t border-border pt-3 hover:text-text"
      >
        <span className="flex shrink-0">
          {members.slice(0, 3).map((m, i) => (
            <span key={m.id} className={cn('rounded-full ring-2 ring-surface', i > 0 && '-ml-3')}>
              <MemberAvatar member={m} size="lg" />
            </span>
          ))}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">{t('settings.title')}</span>
          <span id="more-settings-hint" className="text-[0.8125rem] text-text-muted">
            {t('settings.hint')}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-text-muted" />
      </Link>
    </div>
  );
}

/**
 * Tiroir de la barre du bas (mobile) : s'ouvre en touchant « Plus » ou en tirant la barre vers
 * le haut, et montre toutes les autres pages d'un coup d'œil.
 */
export function NavDrawer({
  open,
  onOpenChange,
  pathname,
  members,
  admin = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  members: HouseholdMemberDto[];
  admin?: boolean;
}) {
  const t = useTranslations('more');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('title')} closeLabel={t('close')}>
        <MoreGrid
          pathname={pathname}
          members={members}
          admin={admin}
          onNavigate={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
