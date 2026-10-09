'use client';

import type { SearchResultsDto } from '@agenda/contracts';
import { useQuery } from '@tanstack/react-query';
import { Cake, CheckCircle2, Circle, ShoppingCart, StickyNote, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/states';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/offline';

/** Recherche globale (« / ») : tâches, notes, dates, dépenses et courses du foyer. */
export function GlobalSearch({
  householdId,
  open,
  onOpenChange,
}: {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('search');
  const format = useFormatter();
  const online = useOnline();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  // Une requête par pause de frappe, pas une par lettre.
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);
  useEffect(() => {
    if (!open) setText('');
  }, [open]);
  const results = useQuery({
    queryKey: ['search', householdId, q],
    queryFn: () =>
      api<SearchResultsDto>(`/v1/households/${householdId}/search?q=${encodeURIComponent(q)}`),
    enabled: open && online && q.length >= 2,
    staleTime: 10_000,
  });
  const close = () => onOpenChange(false);
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00`), { day: 'numeric', month: 'short' });
  const r = results.data;
  const count = r
    ? r.tasks.length + r.notes.length + r.dates.length + r.expenses.length + r.shopping.length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('title')}
        closeLabel={t('close')}
        className="sm:max-w-xl"
        // Le champ prend le focus à l'ouverture ; Radix le rend ensuite à l'élément d'origine.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
        // Ouverte avec « / » sans élément focalisé : le focus revient au bouton « Rechercher » visible.
        fallbackFocus={() =>
          Array.from(document.querySelectorAll<HTMLElement>('[data-search-trigger]')).find(
            (el) => el.offsetParent !== null,
          ) ?? null
        }
      >
        <input
          ref={input}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('label')}
          placeholder={t('placeholder')}
          className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <div aria-live="polite" className="flex flex-col gap-4">
          {!online ? (
            <p className="text-sm text-text-muted">{t('offline')}</p>
          ) : q.length < 2 ? (
            <p className="text-sm text-text-muted">{t('hint')}</p>
          ) : results.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : results.error ? (
            <p className="text-sm text-text-muted">{t('error')}</p>
          ) : count === 0 ? (
            <p className="text-sm text-text-muted">{t('empty', { q })}</p>
          ) : (
            r && (
              <>
                <Group title={t('tasks')} show={r.tasks.length > 0}>
                  {r.tasks.map((x) => (
                    <Item
                      key={x.occurrenceId}
                      href={`/?open=${x.occurrenceId}`}
                      onPick={close}
                      icon={x.done ? CheckCircle2 : Circle}
                      title={x.title}
                      meta={[x.date && day(x.date), x.done && t('done')]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                </Group>
                <Group title={t('notes')} show={r.notes.length > 0}>
                  {r.notes.map((x) => (
                    <Item
                      key={x.id}
                      href="/notes"
                      onPick={close}
                      icon={StickyNote}
                      title={x.title}
                      meta={x.snippet}
                    />
                  ))}
                </Group>
                <Group title={t('dates')} show={r.dates.length > 0}>
                  {r.dates.map((x) => (
                    <Item
                      key={x.id}
                      href="/dates"
                      onPick={close}
                      icon={Cake}
                      title={x.title}
                      meta={format.dateTime(new Date(Date.UTC(2024, x.month - 1, x.day, 12)), {
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC',
                      })}
                    />
                  ))}
                </Group>
                <Group title={t('expenses')} show={r.expenses.length > 0}>
                  {r.expenses.map((x) => (
                    <Item
                      key={x.id}
                      href={`/expenses?month=${x.date.slice(0, 7)}`}
                      onPick={close}
                      icon={Wallet}
                      title={x.title}
                      meta={`${day(x.date)} · ${format.number(x.amountCents / 100, {
                        style: 'currency',
                        currency: 'EUR',
                      })}`}
                    />
                  ))}
                </Group>
                <Group title={t('shopping')} show={r.shopping.length > 0}>
                  {r.shopping.map((x) => (
                    <Item
                      key={x.id}
                      href="/shopping"
                      onPick={close}
                      icon={ShoppingCart}
                      title={x.text}
                      meta={x.done ? t('inCart') : t('toBuy')}
                    />
                  ))}
                </Group>
              </>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Group({ title, show, children }: { title: string; show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-[0.75rem] font-medium uppercase tracking-wide text-text-muted">
        {title}
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function Item({
  href,
  onPick,
  icon: Icon,
  title,
  meta,
}: {
  href: string;
  onPick: () => void;
  icon: typeof Circle;
  title: string;
  meta: string;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onPick}
        className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-muted"
      >
        <Icon aria-hidden className="size-4 shrink-0 stroke-[1.5] text-text-muted" />
        <span className="flex min-w-0 flex-col">
          <span className="break-words text-[0.9375rem]">{title}</span>
          {meta && <span className="truncate text-[0.8125rem] text-text-muted">{meta}</span>}
        </span>
      </Link>
    </li>
  );
}
