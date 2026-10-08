'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MORE_LINKS } from '@/components/app/nav-drawer';

/** « Plus » (mobile) : les pages qui n'ont pas de place dans la barre du bas. */
export default function MorePage() {
  const t = useTranslations('more');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{t('title')}</h1>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {MORE_LINKS.map(({ href, key, icon: Icon }) => (
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
