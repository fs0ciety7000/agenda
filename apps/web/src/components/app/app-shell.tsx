'use client';

import {
  BarChart3,
  Cake,
  CalendarDays,
  ListChecks,
  Menu,
  Search,
  Settings,
  ShoppingCart,
  StickyNote,
  Sun,
  type LucideIcon,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { ApiError, errorKey } from '@/lib/api';
import { cn } from '@/lib/cn';
import { GlobalSearch } from './global-search';
import { MORE_LINKS, NavDrawer } from './nav-drawer';
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
  | 'notes'
  | 'dates'
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
  { href: '/notes', key: 'notes', icon: StickyNote, mobile: false },
  { href: '/dates', key: 'dates', icon: Cake, mobile: false },
  { href: '/calendar', key: 'calendar', icon: CalendarDays },
  { href: '/stats', key: 'stats', icon: BarChart3, mobile: false },
  { href: '/settings', key: 'settings', icon: Settings, mobile: false },
  { href: '/more', key: 'more', icon: Menu, desktop: false },
];

/** Pages accessibles depuis « Plus » sur mobile (onglet actif quand on y est). */
export const MORE_PAGES = MORE_LINKS.map((l) => l.href);

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const households = useHouseholds();
  const [mountedAt] = useState(() => Date.now());
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  // Barre du bas tirée vers le haut : ouvre le tiroir (« Plus » fait la même chose au toucher).
  const dragStart = useRef<number | null>(null);
  const freshHouseholds = households.isFetchedAfterMount && households.dataUpdatedAt >= mountedAt;

  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
  const household = households.data?.[0];
  const session = useMemo(
    () => (me.data && household ? { me: me.data, household } : null),
    [me.data, household],
  );
  // La page se monte en différé (priorité « transition ») : React la rend par petits morceaux
  // au lieu d'une seule longue tâche qui fige le fil principal (budget Lighthouse de l'accueil).
  // Premier rendu : le squelette ; le contenu suit aussitôt.
  const shown = useDeferredValue(session, null);
  useRealtime(household?.id);

  // Raccourcis clavier (hors saisie) : « / » ouvre la recherche globale, « T » revient à
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
        setSearch(true);
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
        <button
          type="button"
          onClick={() => setSearch(true)}
          data-search-trigger
          aria-keyshortcuts="/"
          className="mb-2 flex h-11 items-center justify-center gap-3 rounded-md border border-border px-3 text-[0.9375rem] text-text-muted transition-colors hover:bg-surface-muted hover:text-text xl:justify-start"
        >
          <Search aria-hidden className="size-5 stroke-[1.5]" />
          <span className="sr-only xl:not-sr-only">{t('search.title')}</span>
          <kbd className="ml-auto hidden rounded border border-border px-1.5 text-xs xl:inline">
            /
          </kbd>
        </button>
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
        <div className="-mt-2 mb-6 flex items-center justify-between gap-2 md:hidden">
          <Link href="/" className="flex w-fit items-center gap-2">
            <Image src="/icons/icon-192.png" alt="" width={28} height={28} className="size-7" />
            <span className="text-[0.9375rem] font-semibold">{t('app.name')}</span>
          </Link>
          <button
            type="button"
            onClick={() => setSearch(true)}
            data-search-trigger
            aria-label={t('search.title')}
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
          >
            <Search aria-hidden className="size-5 stroke-[1.5]" />
          </button>
        </div>
        <OfflineBanner />
        {shown ? (
          <SessionContext.Provider value={shown}>{children}</SessionContext.Provider>
        ) : (
          <div aria-busy className="flex flex-col gap-4" aria-label={t('common.loading')}>
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
      </main>

      {/* Mobile : barre d'onglets en bas ; la tirer vers le haut ouvre le tiroir « Plus ». */}
      <nav
        aria-label={t('nav.main')}
        onPointerDown={(e) => {
          // Suivi sur toute la fenêtre : le doigt (ou la souris) quitte vite la barre.
          dragStart.current = e.clientY;
          const move = (m: PointerEvent) => {
            if (dragStart.current !== null && dragStart.current - m.clientY > 40) {
              dragStart.current = null;
              setDrawer(true);
            }
          };
          const end = () => {
            dragStart.current = null;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', end);
          window.addEventListener('pointercancel', end);
        }}
        className="fixed inset-x-0 bottom-0 z-40 touch-pan-x border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <span
          aria-hidden
          className="mx-auto mt-1.5 block h-1 w-9 rounded-full bg-border-strong/60"
        />
        <div className="grid grid-cols-5">
          {NAV.filter((n) => n.mobile !== false).map(({ href, key, icon: Icon }) => {
            const className = cn(
              'flex h-14 flex-col items-center justify-center gap-1 text-[0.75rem] text-text-muted',
              isActive(href) && 'font-medium text-accent',
            );
            const content = (
              <>
                <Icon aria-hidden className="size-5 stroke-[1.5]" />
                {/* Sous 360 px, les libellés ne tiennent pas (« Boodschappen ») : icônes seules,
                    libellé lu par les lecteurs d'écran. */}
                <span className="sr-only min-[360px]:not-sr-only">{t(`nav.${key}`)}</span>
              </>
            );
            return href === '/more' ? (
              <button
                key={href}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={drawer}
                aria-current={isActive(href) ? 'page' : undefined}
                onClick={() => setDrawer(true)}
                className={className}
              >
                {content}
              </button>
            ) : (
              <Link
                key={href}
                href={href}
                // Sinon, tirer un lien lance le glisser-déposer du navigateur et annule le geste.
                draggable={false}
                aria-current={isActive(href) ? 'page' : undefined}
                className={className}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </nav>
      <NavDrawer open={drawer} onOpenChange={setDrawer} pathname={pathname} />
      {household && (
        <GlobalSearch householdId={household.id} open={search} onOpenChange={setSearch} />
      )}
    </div>
  );
}
