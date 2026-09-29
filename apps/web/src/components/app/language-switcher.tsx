'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { LOCALE_COOKIE, LOCALES, type AppLocale } from '@/i18n/locale';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Noms des langues dans leur propre langue (jamais traduits). */
const NAMES: Record<AppLocale, string> = { fr: 'Français', en: 'English' };

/**
 * Choix de la langue : cookie lu par le serveur (i18n/request.ts), puis, une fois connecté,
 * langue du compte (e-mails). `account` : enregistrer aussi dans le compte.
 */
export function LanguageSwitcher({
  account = false,
  label,
  className,
}: {
  account?: boolean;
  label: string;
  className?: string;
}) {
  const current = useLocale() as AppLocale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const choose = async (locale: AppLocale) => {
    if (locale === current) return;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    if (account) {
      await api('/v1/me', { method: 'PATCH', json: { locale } }).catch(() => {});
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    }
    startTransition(() => router.refresh());
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-busy={pending}
      className={cn(
        'inline-flex self-start rounded-md border border-border bg-surface p-1',
        className,
      )}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          role="radio"
          lang={locale}
          aria-checked={current === locale}
          onClick={() => void choose(locale)}
          className={cn(
            'min-h-9 rounded-sm px-4 py-1.5 text-sm text-text-muted transition-colors',
            current === locale && 'bg-surface-muted font-medium text-text',
          )}
        >
          {NAMES[locale]}
        </button>
      ))}
    </div>
  );
}
