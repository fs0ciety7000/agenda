'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from '@/components/app/household-context';
import { MoreGrid } from '@/components/app/nav-drawer';

/** « Plus » (mobile) : les pages qui n'ont pas de place dans la barre du bas. */
export default function MorePage() {
  const t = useTranslations('more');
  const pathname = usePathname();
  const { household, me } = useSession();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[2.375rem] font-normal leading-[1.05] tracking-[-0.02em]">
        {t('title')}
      </h1>
      <MoreGrid pathname={pathname} members={household.members} admin={me.isAdmin} />
    </div>
  );
}
