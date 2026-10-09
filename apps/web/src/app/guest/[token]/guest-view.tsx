'use client';

import type { GuestShoppingDto, GuestShoppingItemDto } from '@agenda/contracts';
import { AISLES } from '@agenda/domain';
import { useQuery } from '@tanstack/react-query';
import { Check, Link2Off, ShoppingCart } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SectionTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Rechargée toutes les 30 s : l'invité n'a pas de session, donc pas de temps réel. */
const REFRESH_MS = 30_000;

export function GuestShoppingView() {
  const t = useTranslations('guest');
  const ts = useTranslations('shopping');
  const te = useTranslations('errors');
  const { token } = useParams<{ token: string }>();
  const list = useQuery({
    queryKey: ['guest-shopping', token],
    queryFn: () => api<GuestShoppingDto>(`/v1/guest/shopping/${encodeURIComponent(token)}`),
    refetchInterval: REFRESH_MS,
    // Lien coupé : inutile d'insister.
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 2,
  });
  const gone = list.error instanceof ApiError && list.error.status === 404;
  const items = list.data?.items ?? [];
  const toBuy = items.filter((i) => !i.done);
  const inCart = items.filter((i) => i.done);

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{t('title')}</h1>
        {list.data && (
          <p className="text-[0.9375rem] text-text-muted">
            {t('household', { name: list.data.householdName })} · {t('readOnly')}
          </p>
        )}
      </header>

      {list.isPending ? (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : gone ? (
        <EmptyState icon={Link2Off} title={t('goneTitle')} body={t('goneBody')} />
      ) : list.error && !list.data ? (
        <ErrorState
          message={t('error')}
          retryLabel={te('retry')}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          illustration="shopping"
          title={ts('emptyTitle')}
          body={t('emptyBody')}
        />
      ) : (
        <>
          <section aria-labelledby="guest-to-buy" className="flex flex-col gap-2">
            <SectionTitle id="guest-to-buy">{ts('toBuy', { count: toBuy.length })}</SectionTitle>
            {toBuy.length === 0 ? (
              <p className="text-[0.9375rem] text-text-muted">{ts('allDone')}</p>
            ) : (
              AISLES.map((aisle) => {
                const inAisle = toBuy.filter((i) => i.aisle === aisle);
                if (!inAisle.length) return null;
                return (
                  <div key={aisle} className="flex flex-col gap-1">
                    <h3 className="text-[0.8125rem] font-medium text-text-muted">
                      {ts(`aisles.${aisle}`)}
                    </h3>
                    <GuestList items={inAisle} label={ts(`aisles.${aisle}`)} />
                  </div>
                );
              })
            )}
          </section>
          {inCart.length > 0 && (
            <section aria-labelledby="guest-in-cart" className="flex flex-col gap-2">
              <SectionTitle id="guest-in-cart">
                {ts('inCart', { count: inCart.length })}
              </SectionTitle>
              <GuestList items={inCart} label={ts('inCart', { count: inCart.length })} />
            </section>
          )}
        </>
      )}

      <p className="mt-auto pt-6 text-center text-[0.8125rem] text-text-muted">{t('by')}</p>
    </main>
  );
}

/** Lecture seule : l'état pris est montré (coche + texte barré + section), pas modifiable. */
function GuestList({ items, label }: { items: GuestShoppingItemDto[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
    >
      {items.map((item) => (
        <li key={item.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
          {/* Pas de case vide (on croirait pouvoir cocher) : une puce, ou la coche si c'est pris. */}
          <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
            {item.done ? (
              <Check className="size-4 stroke-[2.5] text-success" />
            ) : (
              <span className="size-1.5 rounded-full bg-text-muted" />
            )}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 break-words text-[0.9375rem]',
              item.done && 'text-text-muted line-through',
            )}
          >
            {item.text}
            {item.quantity && (
              <span className="ml-2 rounded-sm bg-surface-muted px-1.5 py-0.5 text-[0.8125rem] tabular-nums text-text-muted">
                {item.quantity}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
