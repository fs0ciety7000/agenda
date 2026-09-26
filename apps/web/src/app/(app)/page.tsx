'use client';

import { Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSession } from '@/components/app/household-context';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';

/** Dashboard « Aujourd'hui ». Les tâches arrivent en Phase 2. */
export default function TodayPage() {
  const t = useTranslations('today');
  const { me, household } = useSession();
  const member = household.members.find((m) => m.userId === me.id);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">
        {t('greeting', { name: member?.displayName ?? me.displayName })}
      </h1>
      <section aria-labelledby="today-heading" className="flex flex-col gap-3">
        <SectionTitle id="today-heading">{t('sectionToday')}</SectionTitle>
        <Card className="p-0">
          <EmptyState icon={Sun} title={t('emptyTitle')} body={t('emptyBody')} />
        </Card>
      </section>
    </div>
  );
}
