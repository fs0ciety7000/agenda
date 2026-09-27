'use client';

import type { ShoppingItemDto } from '@agenda/contracts';
import { Check, Plus, ShoppingCart, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { useSession } from '@/components/app/household-context';
import { Button } from '@/components/ui/button';
import { SectionTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { errorKey } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRealtimeStatus } from '@/lib/realtime';
import { splitItems, useShopping, useShoppingActions } from '@/lib/shopping';

/**
 * Liste de courses permanente du foyer : ajoutée par l'un, cochée par l'autre au magasin,
 * visible des deux en temps réel.
 */
export default function ShoppingPage() {
  const t = useTranslations('shopping');
  const te = useTranslations('errors');
  const { me, household } = useSession();
  const memberId = household.members.find((m) => m.userId === me.id)?.id ?? '';
  const names = new Map(household.members.map((m) => [m.id, m.displayName]));
  const list = useShopping(household.id);
  const actions = useShoppingActions(household.id, memberId);
  const live = useRealtimeStatus();
  const [text, setText] = useState('');
  const inputId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const texts = splitItems(text);
    if (!texts.length) return;
    actions.add.mutate(texts);
    setText('');
  };

  const items = list.data ?? [];
  const toBuy = items.filter((i) => !i.done);
  const inCart = items.filter((i) => i.done);
  const failed = [actions.add, actions.toggle, actions.remove, actions.clearDone].find(
    (m) => m.error,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{t('title')}</h1>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-[0.8125rem]',
            live ? 'text-success' : 'text-text-muted',
          )}
        >
          <span
            aria-hidden
            className={cn('size-2 rounded-full', live ? 'bg-success' : 'bg-text-muted/50')}
          />
          {t(live ? 'live' : 'notLive')}
        </span>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('add')}
        </label>
        <input
          id={inputId}
          value={text}
          maxLength={2000}
          autoComplete="off"
          placeholder={t('placeholder')}
          onChange={(e) => setText(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <Button type="submit" disabled={!text.trim()} aria-label={t('add')} title={t('add')}>
          <Plus aria-hidden className="size-5" />
        </Button>
      </form>

      {failed && (
        <p role="alert" className="text-sm text-danger">
          {te(errorKey(failed.error) as 'generic')}
        </p>
      )}

      {list.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : list.error ? (
        <ErrorState
          message={te(errorKey(list.error) as 'generic')}
          retryLabel={te('retry')}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={ShoppingCart} title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <section aria-labelledby="to-buy" className="flex flex-col gap-2">
            <SectionTitle id="to-buy">{t('toBuy', { count: toBuy.length })}</SectionTitle>
            {toBuy.length === 0 ? (
              <p className="text-[0.9375rem] text-text-muted">{t('allDone')}</p>
            ) : (
              <ItemList
                items={toBuy}
                label={t('toBuy', { count: toBuy.length })}
                onToggle={(i) => actions.toggle.mutate({ id: i.id, done: true })}
                onRemove={(i) => actions.remove.mutate(i.id)}
                removeLabel={(i) => t('remove', { text: i.text })}
              />
            )}
          </section>
          {inCart.length > 0 && (
            <section aria-labelledby="in-cart" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle id="in-cart">{t('inCart', { count: inCart.length })}</SectionTitle>
                <button
                  type="button"
                  onClick={() => actions.clearDone.mutate()}
                  className="min-h-11 rounded-md px-2 text-sm text-accent hover:bg-surface-muted"
                >
                  {t('clear')}
                </button>
              </div>
              <ItemList
                items={inCart}
                label={t('inCart', { count: inCart.length })}
                onToggle={(i) => actions.toggle.mutate({ id: i.id, done: false })}
                onRemove={(i) => actions.remove.mutate(i.id)}
                removeLabel={(i) => t('remove', { text: i.text })}
                meta={(i) =>
                  i.doneById && names.get(i.doneById)
                    ? t('takenBy', { name: names.get(i.doneById)! })
                    : null
                }
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ItemList({
  items,
  label,
  onToggle,
  onRemove,
  removeLabel,
  meta,
}: {
  items: ShoppingItemDto[];
  label: string;
  onToggle: (i: ShoppingItemDto) => void;
  onRemove: (i: ShoppingItemDto) => void;
  removeLabel: (i: ShoppingItemDto) => string;
  meta?: (i: ShoppingItemDto) => string | null;
}) {
  return (
    <ul
      aria-label={label}
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
    >
      {items.map((item) => (
        <li key={item.id} className="flex min-h-12 items-center gap-2 px-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={item.done}
            aria-label={item.text}
            onClick={() => onToggle(item)}
            className="flex size-11 shrink-0 items-center justify-center rounded-md"
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-sm border-[1.5px]',
                item.done ? 'border-success bg-success text-white' : 'border-text-muted/70',
              )}
            >
              {item.done && <Check aria-hidden className="size-3.5 stroke-[3]" />}
            </span>
          </button>
          <span className="min-w-0 flex-1 py-2">
            <span
              className={cn(
                'block break-words text-[0.9375rem]',
                item.done && 'text-text-muted line-through',
              )}
            >
              {item.text}
            </span>
            {meta?.(item) && (
              <span className="block text-[0.8125rem] text-text-muted">{meta(item)}</span>
            )}
          </span>
          <button
            type="button"
            aria-label={removeLabel(item)}
            onClick={() => onRemove(item)}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:text-text"
          >
            <X aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
