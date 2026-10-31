import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

/** Adresse inconnue : message neutre et retour vers « Aujourd'hui ». */
export default async function NotFound() {
  const t = await getTranslations('notFoundPage');
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-12"
    >
      <p className="text-xs font-medium tracking-[0.04em] text-text-muted uppercase">{t('code')}</p>
      <h1 className="font-display text-[2rem] font-normal leading-tight tracking-[-0.02em]">
        {t('title')}
      </h1>
      <p className="text-[0.9375rem] text-text-muted">{t('body')}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/">{t('home')}</Link>
        </Button>
      </div>
    </main>
  );
}
