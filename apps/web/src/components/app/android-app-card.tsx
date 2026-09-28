'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface AndroidVersion {
  versionName: string;
}

/** Lien de téléchargement de l'app Android (servi par l'API), si une version est publiée. */
export function AndroidAppCard() {
  const t = useTranslations('androidApp');
  const version = useQuery({
    queryKey: ['android-version'],
    queryFn: async () => {
      const res = await fetch('/v1/app/android/version.json');
      return res.ok ? ((await res.json()) as AndroidVersion) : null;
    },
    staleTime: 10 * 60_000,
  });
  if (!version.data) return null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <Smartphone aria-hidden className="mt-0.5 size-5 text-text-muted" />
        <div>
          <p className="text-[0.9375rem]">{t('title', { version: version.data.versionName })}</p>
          <p className="text-[0.8125rem] text-text-muted">{t('hint')}</p>
        </div>
      </div>
      <Button asChild variant="secondary" size="sm">
        <a href="/v1/app/android/tandem.apk" download>
          <Download aria-hidden className="size-4" />
          {t('download')}
        </a>
      </Button>
    </Card>
  );
}
