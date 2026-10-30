'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from '@/components/app/household-context';
import { MoreGrid } from '@/components/app/nav-drawer';

/** « Plus » (mobile) : les pages qui n'ont pas de place dans la barre du bas. */
export default function MorePage() {
  const t = useTranslations('more');
  const pathname = usePathname();
  const { household } = useSession();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em]">{t('title')}</h1>
      <MoreGrid pathname={pathname} members={household.members} />
    </div>
  );
}
