'use client';

import {
  BarChart3,
  ChevronRight,
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

const LINKS: {
  href: string;
  key: 'expenses' | 'notes' | 'meals' | 'stats' | 'review' | 'history' | 'settings';
  icon: LucideIcon;
}[] = [
  { href: '/expenses', key: 'expenses', icon: Wallet },
  { href: '/notes', key: 'notes', icon: StickyNote },
  { href: '/meals', key: 'meals', icon: UtensilsCrossed },
  { href: '/stats', key: 'stats', icon: BarChart3 },
  { href: '/review', key: 'review', icon: Sparkles },
  { href: '/history', key: 'history', icon: History },
  { href: '/settings', key: 'settings', icon: Settings },
];

/** « Plus » (mobile) : les pages qui n'ont pas de place dans la barre du bas. */
export default function MorePage() {
  const t = useTranslations('more');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{t('title')}</h1>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {LINKS.map(({ href, key, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-muted"
            >
              <Icon aria-hidden className="size-5 stroke-[1.5] text-text-muted" />
              <span className="flex flex-1 flex-col">
                <span className="font-medium">{t(`${key}.title`)}</span>
                <span className="text-[0.8125rem] text-text-muted">{t(`${key}.hint`)}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
