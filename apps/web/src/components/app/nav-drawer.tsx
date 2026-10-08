'use client';

import {
  BarChart3,
  Cake,
  History,
  type LucideIcon,
  Settings,
  Sparkles,
  StickyNote,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

/** Pages sans place dans la barre du bas (mobile) : tiroir « Plus » et page `/more`. */
export const MORE_LINKS: {
  href: string;
  key: 'expenses' | 'notes' | 'dates' | 'meals' | 'stats' | 'review' | 'history' | 'settings';
  icon: LucideIcon;
}[] = [
  { href: '/expenses', key: 'expenses', icon: Wallet },
  { href: '/notes', key: 'notes', icon: StickyNote },
  { href: '/dates', key: 'dates', icon: Cake },
  { href: '/meals', key: 'meals', icon: UtensilsCrossed },
  { href: '/stats', key: 'stats', icon: BarChart3 },
  { href: '/review', key: 'review', icon: Sparkles },
  { href: '/history', key: 'history', icon: History },
  { href: '/settings', key: 'settings', icon: Settings },
];

/**
 * Tiroir de la barre du bas (mobile) : s'ouvre en touchant « Plus » ou en tirant la barre vers
 * le haut, et montre toutes les autres pages d'un coup d'œil.
 */
export function NavDrawer({
  open,
  onOpenChange,
  pathname,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
}) {
  const t = useTranslations('more');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('title')} closeLabel={t('close')}>
        <ul className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-3">
          {MORE_LINKS.map(({ href, key, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-3 text-center text-[0.8125rem] hover:bg-surface-muted',
                    active && 'border-accent font-medium text-accent',
                  )}
                >
                  <Icon aria-hidden className="size-6 stroke-[1.5]" />
                  <span className="break-words">{t(`${key}.title`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
