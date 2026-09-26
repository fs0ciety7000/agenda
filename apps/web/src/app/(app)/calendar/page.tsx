import { Construction } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';

export default async function Page() {
  const t = await getTranslations();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('nav.calendar')}</h1>
      <Card className="p-0">
        <EmptyState
          icon={Construction}
          title={t('placeholder.title')}
          body={t('placeholder.body')}
        />
      </Card>
    </div>
  );
}
