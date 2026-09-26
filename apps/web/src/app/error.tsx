'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/report-error';

/** Erreur d'affichage d'une page : remontée, message humain, bouton pour réessayer. */
export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('errorPage');
  useEffect(() => reportError(error), [error]);
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-[0.9375rem] text-text-muted">{t('body')}</p>
      <div>
        <Button onClick={reset}>{t('retry')}</Button>
      </div>
    </main>
  );
}
