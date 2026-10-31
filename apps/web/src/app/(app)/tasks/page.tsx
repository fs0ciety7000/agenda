'use client';

import type { OccurrenceDto, OccurrenceQuery, TaskPriority } from '@agenda/contracts';
import { ListChecks, Search, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { useSession } from '@/components/app/household-context';
import { TaskList } from '@/components/app/task-row';
import { useTaskDialog } from '@/components/app/use-task-dialog';
import { QuickAdd } from '@/components/app/quick-add';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { errorKey } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDayLabel, useToday } from '@/lib/format';
import { diffDays } from '@agenda/domain';
import { useCategories, useOccurrences } from '@/lib/tasks';
import { SeriesList } from '@/components/app/series-list';

type Tab =
  | 'all'
  | 'today'
  | 'upcoming'
  | 'overdue'
  | 'unscheduled'
  | 'done'
  | 'personal'
  | 'shared'
  | 'together'
  | 'recurring';
const TABS: Tab[] = [
  'all',
  'today',
  'upcoming',
  'overdue',
  'recurring',
  'unscheduled',
  'personal',
  'shared',
  'together',
  'done',
];

/** Correspondance onglet → requête API. */
function tabQuery(tab: Tab): Partial<OccurrenceQuery> {
  switch (tab) {
    case 'personal':
      return { visibility: 'PERSONAL', status: 'TODO' };
    case 'shared':
      return { visibility: 'SHARED', status: 'TODO' };
    case 'together':
      return { assignee: 'together', status: 'TODO' };
    case 'all':
    case 'recurring':
      return { status: 'TODO' };
    default:
      return { view: tab };
  }
}

function TasksView() {
  const t = useTranslations('tasksPage');
  const tt = useTranslations('tasks');
  const te = useTranslations('errors');
  const { household } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const dialog = useTaskDialog();
  const categories = useCategories(household.id);
  const dayLabel = useDayLabel();
  const format = useFormatter();
  const today = useToday();
  // À droite du jour : « dans 2 jours », ou la date quand le titre dit déjà « Demain ».
  const relativeDay = (date: string) => {
    const d = diffDays(today, date);
    if (Math.abs(d) <= 1)
      return format.dateTime(new Date(`${date}T12:00:00Z`), {
        timeZone: 'UTC',
        weekday: 'long',
        day: 'numeric',
      });
    return format.relativeTime(new Date(`${date}T12:00:00Z`), {
      now: new Date(`${today}T12:00:00Z`),
      unit: 'day',
    });
  };

  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'all') as Tab;
  const assignee = params.get('assignee') ?? '';
  const categoryId = params.get('category') ?? '';
  const priority = (params.get('priority') ?? '') as TaskPriority | '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  // Raccourci « / » depuis une autre page : la recherche prend le focus à l'arrivée.
  useEffect(() => {
    if (params.get('search') === '1') document.getElementById('task-search')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [q, setQ] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const query: Partial<OccurrenceQuery> = {
    ...tabQuery(tab),
    ...(assignee && tab !== 'together'
      ? { assignee: assignee as OccurrenceQuery['assignee'] }
      : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(priority ? { priority } : {}),
    ...(q ? { q } : {}),
  };
  const list = useOccurrences(household.id, query);
  const activeFilters = [
    assignee && tab !== 'together' && tab !== 'personal',
    categoryId,
    priority,
  ].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showFilters = filtersOpen || activeFilters > 0;
  const groups = groupItems(list.data ?? [], tab === 'done');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[2.375rem] font-normal leading-[1.05] tracking-[-0.02em]">
        {t('title')}
      </h1>

      <QuickAdd onMoreOptions={dialog.openNew} />

      {/* Marge verticale dans la zone qui défile : sinon elle rogne les pastilles (texte agrandi).
          Fondu au bord droit (mobile) : il reste des onglets à faire défiler. */}
      <nav
        aria-label={t('views')}
        className="-mx-4 -my-1 overflow-x-auto px-4 py-1 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] md:mx-0 md:px-0 md:[mask-image:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex gap-2">
          {TABS.map((key) => {
            const next = new URLSearchParams(params);
            next.set('tab', key);
            return (
              <li key={key}>
                <Link
                  href={`${pathname}?${next.toString()}`}
                  replace
                  scroll={false}
                  aria-current={tab === key ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-10 items-center whitespace-nowrap rounded-full border border-border bg-surface px-4 text-sm transition-colors hover:bg-surface-muted',
                    tab === key &&
                      'border-accent bg-accent font-semibold text-accent-fg hover:bg-accent',
                  )}
                >
                  {t(`tabs.${key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className={cn(
          'grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-4',
          tab === 'recurring' && 'hidden',
        )}
      >
        <div className="flex gap-2 min-[360px]:col-span-2 md:col-span-1">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="task-search" className="sr-only">
              {t('search')}
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            />
            <input
              id="task-search"
              type="search"
              value={search}
              placeholder={t('search')}
              onChange={(e) => {
                setSearch(e.target.value);
                setParam('q', e.target.value.trim());
              }}
              className="h-11 w-full rounded-full border border-border-strong bg-surface pl-9 pr-3 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
          </div>
          {/* Mobile : les trois filtres se replient derrière ce bouton (ouverts si l'un est actif). */}
          <button
            type="button"
            aria-expanded={showFilters}
            aria-controls="task-filters"
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm md:hidden',
              activeFilters > 0
                ? 'border-accent bg-accent font-semibold text-accent-fg'
                : 'border-border bg-surface',
            )}
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            {activeFilters > 0 ? t('filtersCount', { count: activeFilters }) : t('filtersOpen')}
          </button>
        </div>
        <div id="task-filters" className={showFilters ? 'contents' : 'hidden md:contents'}>
          {tab !== 'together' && tab !== 'personal' && (
            <Select
              label={t('filters.person')}
              hideLabel
              value={assignee}
              onChange={(e) => setParam('assignee', e.target.value)}
            >
              <option value="">{t('filters.everyone')}</option>
              {household.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
              <option value="unassigned">{tt('unassigned')}</option>
            </Select>
          )}
          <Select
            label={t('filters.category')}
            hideLabel
            value={categoryId}
            onChange={(e) => setParam('category', e.target.value)}
          >
            <option value="">{t('filters.allCategories')}</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji ? `${c.emoji} ` : ''}
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label={t('filters.priority')}
            hideLabel
            value={priority}
            onChange={(e) => setParam('priority', e.target.value)}
          >
            <option value="">{t('filters.allPriorities')}</option>
            {(['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const).map((p) => (
              <option key={p} value={p}>
                {tt(`priority.${p}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {tab === 'recurring' ? (
        <SeriesList onOpen={dialog.openEdit} />
      ) : list.error ? (
        <ErrorState
          message={te(errorKey(list.error) as 'generic')}
          retryLabel={te('retry')}
          onRetry={() => void list.refetch()}
        />
      ) : !list.data ? (
        <Skeleton className="h-48 w-full" />
      ) : list.data.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={ListChecks}
            title={t('emptyTitle')}
            body={q || assignee || categoryId || priority ? t('emptyFiltered') : undefined}
          />
        </div>
      ) : (
        <div aria-busy={list.isFetching} className="flex flex-col gap-5">
          {groups.map(([key, items]) => (
            <section key={key} className="flex flex-col gap-2">
              {key !== '_' && (
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-semibold first-letter:uppercase">
                    {key === 'none' ? t('noDate') : dayLabel(key, 'long')}
                  </h2>
                  {key !== 'none' && (
                    <span className="text-[0.8125rem] text-text-muted first-letter:uppercase">
                      {relativeDay(key)}
                    </span>
                  )}
                </div>
              )}
              <TaskList items={items} onOpen={dialog.openEdit} flat />
            </section>
          ))}
        </div>
      )}
      {dialog.dialog}
    </div>
  );
}

function groupItems(items: OccurrenceDto[], flat: boolean): [string, OccurrenceDto[]][] {
  if (flat) return items.length ? [['_', items]] : [];
  const map = new Map<string, OccurrenceDto[]>();
  for (const o of items) {
    const key = o.date ?? 'none';
    map.set(key, [...(map.get(key) ?? []), o]);
  }
  return [...map.entries()];
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  );
}
