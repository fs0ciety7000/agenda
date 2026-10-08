'use client';

import {
  BarChart3,
  CalendarDays,
  ListChecks,
  Menu,
  Settings,
  ShoppingCart,
  Sun,
  type LucideIcon,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { ApiError, errorKey } from '@/lib/api';
import { cn } from '@/lib/cn';
import { OfflineBanner } from './offline-banner';
import { useHouseholds, useMe } from '@/lib/queries';
import { useRealtime } from '@/lib/realtime';
import { SessionContext } from './household-context';

type NavKey =
  | 'today'
  | 'tasks'
  | 'shopping'
  | 'meals'
  | 'expenses'
  | 'calendar'
  | 'stats'
  | 'settings'
  | 'more';
/**
 * Barre du bas (mobile) : cinq onglets au plus. Les pages `mobile: false` sont regroupées dans
 * « Plus » (`/more`), qui n'existe que sur mobile (`desktop: false`).
 */
const NAV: { href: string; key: NavKey; icon: LucideIcon; mobile?: false; desktop?: false }[] = [
  { href: '/', key: 'today', icon: Sun },
  { href: '/tasks', key: 'tasks', icon: ListChecks },
  { href: '/shopping', key: 'shopping', icon: ShoppingCart },
  { href: '/meals', key: 'meals', icon: UtensilsCrossed, mobile: false },
  { href: '/expenses', key: 'expenses', icon: Wallet, mobile: false },
  { href: '/calendar', key: 'calendar', icon: CalendarDays },
  { href: '/stats', key: 'stats', icon: BarChart3, mobile: false },
  { href: '/settings', key: 'settings', icon: Settings, mobile: false },
  { href: '/more', key: 'more', icon: Menu, desktop: false },
];

/** Pages accessibles depuis « Plus » sur mobile (onglet actif quand on y est). */
export const MORE_PAGES = ['/expenses', '/meals', '/stats', '/review', '/settings', '/history'];

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const households = useHouseholds();
  const [mountedAt] = useState(() => Date.now());
  const freshHouseholds = households.isFetchedAfterMount && households.dataUpdatedAt >= mountedAt;

  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
  const household = households.data?.[0];
  useRealtime(household?.id);

  // Raccourcis clavier (hors saisie) : « / » recherche dans les tâches, « T » revient à
  // Aujourd'hui. « N » (nouvelle tâche) est géré par l'ajout rapide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        target.closest('input, textarea, select, [contenteditable], [role="dialog"]')
      )
        return;
      if (e.key === '/') {
        e.preventDefault();
        const field = document.getElementById('task-search');
        if (field) field.focus();
        else router.push('/tasks?search=1');
      } else if (e.key.toLowerCase() === 't' && pathname !== '/') {
        e.preventDefault();
        router.push('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname, router]);

  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    // Seulement sur une réponse reçue pendant cette visite : un cache périmé (ou restauré du
    // stockage local) « aucun foyer » ne doit pas renvoyer à l'onboarding.
    else if (freshHouseholds && households.data?.length === 0) router.replace('/onboarding');
  }, [unauthenticated, freshHouseholds, households.data, pathname, router]);

  if (me.error && !unauthenticated) {
    return (
      <ErrorState
        message={t(`errors.${errorKey(me.error)}` as 'errors.generic')}
        retryLabel={t('errors.retry')}
        onRetry={() => void me.refetch()}
      />
    );
  }

  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname.startsWith(href) ||
        (href === '/more' && MORE_PAGES.some((p) => pathname.startsWith(p)));

  return (
    <div className="min-h-dvh md:flex">
      {/* Tablette / desktop : navigation latérale */}
      <nav
        aria-label={t('nav.main')}
        className="sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 border-r border-border px-3 py-6 md:flex md:w-20 xl:w-60"
      >
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-3 rounded-md px-1 xl:justify-start xl:px-3"
        >
          <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9" />
          <span className="sr-only text-[0.9375rem] font-semibold xl:not-sr-only">
            {t('app.name')}
          </span>
        </Link>
        {NAV.filter((n) => n.desktop !== false).map(({ href, key, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? 'page' : undefined}
            className={cn(
              'flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] text-text-muted transition-colors hover:bg-surface-muted hover:text-text',
              'justify-center xl:justify-start',
              isActive(href) && 'bg-surface-muted font-medium text-text',
            )}
          >
            <Icon aria-hidden className="size-5 stroke-[1.5]" />
            <span className="sr-only xl:not-sr-only">{t(`nav.${key}`)}</span>
          </Link>
        ))}
      </nav>

      <main
        id="main"
        className={cn(
          'mx-auto w-full flex-1 px-4 pb-28 pt-8 md:px-8 md:pb-12',
          pathname.startsWith('/calendar')
            ? 'max-w-6xl'
            : pathname === '/'
              ? 'max-w-3xl xl:max-w-6xl'
              : 'max-w-3xl',
        )}
      >
        {/* Mobile : logo en tête (la navigation latérale le porte sur grand écran). */}
        <Link href="/" className="-mt-2 mb-6 flex w-fit items-center gap-2 md:hidden">
          <Image src="/icons/icon-192.png" alt="" width={28} height={28} className="size-7" />
          <span className="text-[0.9375rem] font-semibold">{t('app.name')}</span>
        </Link>
        <OfflineBanner />
        {me.data && household ? (
          <SessionContext.Provider value={{ me: me.data, household }}>
            {children}
          </SessionContext.Provider>
        ) : (
          <div aria-busy className="flex flex-col gap-4" aria-label={t('common.loading')}>
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
      </main>

      {/* Mobile : barre d'onglets en bas */}
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.filter((n) => n.mobile !== false).map(({ href, key, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? 'page' : undefined}
            className={cn(
              'flex h-16 flex-col items-center justify-center gap-1 text-[0.75rem] text-text-muted',
              isActive(href) && 'font-medium text-accent',
            )}
          >
            <Icon aria-hidden className="size-5 stroke-[1.5]" />
            {/* Sous 360 px, les libellés ne tiennent pas (« Boodschappen ») : icônes seules,
                libellé lu par les lecteurs d'écran. */}
            <span className="sr-only min-[360px]:not-sr-only">{t(`nav.${key}`)}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
