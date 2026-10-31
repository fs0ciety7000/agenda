'use client';

import {
  ChevronLeft,
  ChevronRight,
  House,
  LifeBuoy,
  type LucideIcon,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export type SettingsSection = 'household' | 'account' | 'preferences' | 'data';

/** Les quatre rubriques des Réglages, dans l'ordre du sommaire (même ordre sur Android). */
export const SETTINGS_SECTIONS: { key: SettingsSection; href: string; icon: LucideIcon }[] = [
  { key: 'household', href: '/settings/household', icon: House },
  { key: 'account', href: '/settings/account', icon: ShieldCheck },
  { key: 'preferences', href: '/settings/preferences', icon: SlidersHorizontal },
  { key: 'data', href: '/settings/data', icon: LifeBuoy },
];

/** Sommaire : une ligne par rubrique (icône, titre, ce qu'on y trouve). */
export function SettingsMenu() {
  const t = useTranslations('settings.sections');
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {SETTINGS_SECTIONS.map(({ key, href, icon: Icon }) => (
        <li key={key}>
          <Link
            href={href}
            aria-describedby={`settings-${key}-hint`}
            className="flex min-h-[4.5rem] items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-accent">
              <Icon aria-hidden className="size-5 stroke-[1.5]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-semibold">{t(`${key}.title`)}</span>
              <span id={`settings-${key}-hint`} className="text-[0.8125rem] text-text-muted">
                {t(`${key}.hint`)}
              </span>
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Sous-page d'une rubrique : retour au sommaire, titre, puis ses réglages. */
export function SettingsSubpage({
  section,
  children,
}: {
  section: SettingsSection;
  children: ReactNode;
}) {
  const t = useTranslations('settings');
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/settings"
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-[0.9375rem] text-text-muted hover:text-text"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t('title')}
        </Link>
        <h1 className="font-display text-[2rem] font-normal leading-tight tracking-[-0.02em]">
          {t(`sections.${section}.title`)}
        </h1>
      </div>
      {children}
    </div>
  );
}
