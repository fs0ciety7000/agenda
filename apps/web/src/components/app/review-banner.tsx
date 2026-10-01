'use client';

import { weekdayOf } from '@agenda/domain';
import { Heart } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useToday } from '@/lib/format';

/** Le dimanche : la revue de la semaine est prête. */
export function ReviewBanner() {
  const t = useTranslations('review');
  const today = useToday();
  if (weekdayOf(today) !== 6) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-accent/25 bg-accent/5 px-4 py-3">
      <Heart aria-hidden className="size-5 shrink-0 text-accent" />
      <p className="flex-1 text-sm">{t('banner')}</p>
      <Link
        href="/review"
        className="shrink-0 text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        {t('bannerOpen')}
      </Link>
    </div>
  );
}
