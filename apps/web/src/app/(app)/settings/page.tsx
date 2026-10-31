'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect } from 'react';
import { useSession } from '@/components/app/household-context';
import { MemberAvatar } from '@/components/app/member-avatar';
import { SettingsMenu } from '@/components/app/settings-nav';

/**
 * Anciennes adresses (avant les rubriques) : retours de Google et liens des e-mails déjà
 * envoyés arrivent sur `/settings` ; on les renvoie vers la bonne sous-page.
 */
function LegacyRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const query = params.toString();
    const suffix = query ? `?${query}` : '';
    if (params.has('calendar') || params.has('calendarError'))
      router.replace(`/settings/preferences${suffix}`);
    else if (params.has('linked') || params.has('error')) router.replace(`/settings/data${suffix}`);
    else if (window.location.hash === '#s-account') router.replace('/settings/account');
  }, [params, router]);
  return null;
}

/** Réglages : le foyer en tête, puis les quatre rubriques. */
export default function SettingsPage() {
  const t = useTranslations('settings');
  const { household, me } = useSession();
  return (
    <div className="flex flex-col gap-8">
      <Suspense>
        <LegacyRedirect />
      </Suspense>
      <h1 className="font-display text-[2rem] font-normal leading-tight tracking-[-0.02em]">
        {t('title')}
      </h1>
      <div className="flex items-center gap-4">
        <span className="flex shrink-0">
          {household.members.slice(0, 3).map((m, i) => (
            <span key={m.id} className={i > 0 ? '-ml-3 rounded-full ring-2 ring-bg' : ''}>
              <MemberAvatar member={m} size="lg" />
            </span>
          ))}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="break-words text-lg font-medium">{household.name}</span>
          <span className="break-words text-[0.875rem] text-text-muted">{me.email}</span>
        </span>
      </div>
      <SettingsMenu />
    </div>
  );
}
