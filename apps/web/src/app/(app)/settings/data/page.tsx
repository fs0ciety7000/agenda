'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { AndroidAppCard } from '@/components/app/android-app-card';
import { BackupSettings } from '@/components/app/backup-settings';
import { useSession } from '@/components/app/household-context';
import { PrivacySettings } from '@/components/app/privacy-settings';
import { SettingsSubpage } from '@/components/app/settings-nav';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';

/** Réglages → Données et aide : confidentialité, sauvegarde, aide, app Android. */
export default function DataSettingsPage() {
  const t = useTranslations('settings');
  const { household } = useSession();
  return (
    <SettingsSubpage section="data">
      <section className="flex flex-col gap-3" aria-labelledby="s-privacy">
        <SectionTitle id="s-privacy">{t('privacy')}</SectionTitle>
        <Card>
          <Suspense>
            <PrivacySettings />
          </Suspense>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-backup">
        <SectionTitle id="s-backup">{t('backup')}</SectionTitle>
        <Card>
          <BackupSettings householdId={household.id} />
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-help">
        <SectionTitle id="s-help">{t('help')}</SectionTitle>
        <Card className="flex flex-col gap-3">
          <p className="text-[0.9375rem] text-text-muted">{t('helpHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" className="self-start">
              <Link href="/help">{t('faq')}</Link>
            </Button>
            <Button asChild variant="secondary" className="self-start">
              <Link href="/report?from=/settings/data">{t('report')}</Link>
            </Button>
            <Button asChild variant="ghost" className="self-start">
              <a href={process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.tandem-agenda.app'}>
                {t('docs')}
              </a>
            </Button>
            <Button asChild variant="ghost" className="self-start">
              <Link href="/status">{t('status')}</Link>
            </Button>
          </div>
        </Card>
      </section>

      <AndroidAppCard />
    </SettingsSubpage>
  );
}
