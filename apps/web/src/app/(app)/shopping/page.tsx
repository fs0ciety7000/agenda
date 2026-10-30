'use client';

import type { Aisle, ShoppingItemDto } from '@agenda/contracts';
import { AISLES } from '@agenda/domain';
import { Check, ChevronRight, Plus, ShoppingCart, Store, UtensilsCrossed, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { BarcodeButton } from '@/components/app/barcode-dialog';
import { GuestLinkButton } from '@/components/app/guest-link';
import { useSession } from '@/components/app/household-context';
import { StoreMode } from '@/components/app/store-mode';
import { Button } from '@/components/ui/button';
import { SectionTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { newExpenseHref } from '@/lib/expenses';
import { errorKey } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRealtimeStatus } from '@/lib/realtime';
import {
  splitItems,
  useShopping,
  useShoppingActions,
  useShoppingSuggestions,
} from '@/lib/shopping';

/**
 * Liste de courses permanente du foyer : ajoutée par l'un, cochée par l'autre au magasin,
 * visible des deux en temps réel.
 */
export default function ShoppingPage() {
  const t = useTranslations('shopping');
  const te = useTranslations('errors');
  const tb = useTranslations('barcode');
  const { me, household } = useSession();
  const memberId = household.members.find((m) => m.userId === me.id)?.id ?? '';
  const names = new Map(household.members.map((m) => [m.id, m.displayName]));
  const list = useShopping(household.id);
  const suggestions = useShoppingSuggestions(household.id);
  const actions = useShoppingActions(household.id, memberId);
  const toast = useToast();
  const router = useRouter();
  const live = useRealtimeStatus();
  const [text, setText] = useState('');
  const [store, setStore] = useState(false);
  // Puce de rayon choisie (null = tout) ; un rayon vidé revient à « Tout ».
  const [aisle, setAisle] = useState<Aisle | null>(null);
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

  const aisles = AISLES.filter((a) => toBuy.some((i) => (i.aisle ?? 'OTHER') === a));
  const current = aisle && aisles.includes(aisle) ? aisle : null;
  const shownAisles = current ? [current] : aisles;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em]">
            {t('title')}
          </h1>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[0.8125rem] font-medium',
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
        <div className="flex shrink-0 items-center gap-2">
          {toBuy.length > 0 && (
            <Button className="rounded-full" onClick={() => setStore(true)}>
              <Store aria-hidden className="size-4" />
              {/* Petit écran : icône seule, le titre garde sa place (nom lu quand même). */}
              <span className="max-[419px]:sr-only">{t('storeOpen')}</span>
            </Button>
          )}
          <GuestLinkButton compact />
        </div>
      </div>
      {store && (
        <StoreMode
          items={items}
          onToggle={(i) => actions.toggle.mutate({ id: i.id, done: !i.done })}
          onClose={() => setStore(false)}
        />
      )}

      {/* Mobile : barre d'ajout fixée en bas, à portée du pouce, suggestions au-dessus.
          Desktop : en haut de la liste. */}
      <div
        data-dock
        className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex flex-col-reverse gap-2 px-4 pb-3 md:static md:z-auto md:flex-col md:p-0"
      >
        <form
          onSubmit={submit}
          className="flex h-14 items-center gap-2 rounded-full border border-border bg-surface pl-5 pr-1.5 shadow-raised focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent"
        >
          <label htmlFor={inputId} className="sr-only">
            {t('add')}
          </label>
          <input
            id={inputId}
            value={text}
            maxLength={2000}
            autoComplete="off"
            enterKeyHint="done"
            placeholder={t('placeholder')}
            onChange={(e) => setText(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-text-muted"
          />
          {text.trim() ? (
            <button
              type="submit"
              aria-label={t('add')}
              title={t('add')}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg"
            >
              <Plus aria-hidden className="size-5" />
            </button>
          ) : (
            <BarcodeButton
              compact
              householdId={household.id}
              onAdd={(name) => {
                actions.add.mutate([name]);
                toast({ message: tb('added', { name }) });
              }}
            />
          )}
        </form>
        {(suggestions.data?.length ?? 0) > 0 && (
          <ul
            aria-label={t('suggestions')}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {suggestions.data!.map((s) => (
              <li key={s.text} className="shrink-0">
                <button
                  type="button"
                  onClick={() => actions.add.mutate([s.text])}
                  aria-label={t('addSuggestion', { text: s.text })}
                  className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-surface px-3.5 text-sm hover:bg-surface-muted"
                >
                  <Plus aria-hidden className="size-3.5" />
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {aisles.length > 1 && (
        <nav
          aria-label={t('aisleFilter')}
          className="-mx-4 -my-1 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex gap-2">
            {[null, ...aisles].map((a) => {
              const on = current === a;
              const count = a
                ? toBuy.filter((i) => (i.aisle ?? 'OTHER') === a).length
                : toBuy.length;
              return (
                <li key={a ?? 'all'} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAisle(a)}
                    className={cn(
                      'inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm',
                      on
                        ? 'border-accent bg-accent font-semibold text-accent-fg'
                        : 'border-border bg-surface hover:bg-surface-muted',
                    )}
                  >
                    {a ? t(`aisles.${a}`) : t('aisleAll')}
                    <span className="opacity-70">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

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
        <EmptyState
          icon={ShoppingCart}
          illustration="shopping"
          title={t('emptyTitle')}
          body={t('emptyBody')}
        />
      ) : (
        <>
          <section aria-labelledby="to-buy" className="flex flex-col gap-2">
            <SectionTitle id="to-buy">{t('toBuy', { count: toBuy.length })}</SectionTitle>
            {toBuy.length === 0 ? (
              <p className="text-[0.9375rem] text-text-muted">{t('allDone')}</p>
            ) : (
              // Rangé par rayon, dans l'ordre d'un parcours de magasin.
              shownAisles.map((a) => {
                const inAisle = toBuy.filter((i) => (i.aisle ?? 'OTHER') === a);
                return (
                  <div key={a} className="flex flex-col">
                    <h3 className="pt-3 text-base font-semibold">{t(`aisles.${a}`)}</h3>
                    <ItemList
                      items={inAisle}
                      label={t(`aisles.${a}`)}
                      onToggle={(i) => actions.toggle.mutate({ id: i.id, done: true })}
                      onRemove={(i) => actions.remove.mutate(i.id)}
                      removeLabel={(i) => t('remove', { text: i.text })}
                      onAisle={(i, a) => actions.setAisle.mutate({ id: i.id, aisle: a })}
                    />
                  </div>
                );
              })
            )}
          </section>
          {inCart.length > 0 && (
            <section aria-labelledby="in-cart" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle id="in-cart">{t('inCart', { count: inCart.length })}</SectionTitle>
                <button
                  type="button"
                  onClick={() =>
                    actions.clearDone.mutate(undefined, {
                      // Retour du magasin : proposer de noter ce qui a été payé.
                      onSuccess: () =>
                        toast({
                          message: t('cleared'),
                          action: {
                            label: t('noteExpense'),
                            onClick: () =>
                              router.push(
                                newExpenseHref({ title: t('title'), category: 'GROCERIES' }),
                              ),
                          },
                        }),
                    })
                  }
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

      <Link
        href="/meals"
        className="flex items-center gap-3 rounded-lg bg-surface-muted px-4 py-3.5 hover:bg-border"
      >
        <UtensilsCrossed aria-hidden className="size-5 shrink-0" />
        <span className="flex-1 text-sm">{t('mealsLink')}</span>
        <ChevronRight aria-hidden className="size-4 text-text-muted" />
      </Link>
      {/* Mobile : la barre d'ajout fixe ne cache pas la fin de la liste. */}
      <div aria-hidden className="h-24 md:hidden" />
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
  onAisle,
}: {
  items: ShoppingItemDto[];
  label: string;
  onToggle: (i: ShoppingItemDto) => void;
  onRemove: (i: ShoppingItemDto) => void;
  removeLabel: (i: ShoppingItemDto) => string;
  meta?: (i: ShoppingItemDto) => string | null;
  /** Changer de rayon (retenu pour la prochaine fois). */
  onAisle?: (i: ShoppingItemDto, aisle: Aisle) => void;
}) {
  const t = useTranslations('shopping');
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="-ml-2.5 flex min-h-14 items-center gap-2">
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
                'flex size-6 items-center justify-center rounded-full border-2',
                item.done ? 'border-accent bg-accent text-accent-fg' : 'border-border-strong',
              )}
            >
              {item.done && <Check aria-hidden className="size-3.5 stroke-[3]" />}
            </span>
          </button>
          <span className="min-w-0 flex-1 py-2">
            <span
              className={cn(
                'block break-words text-base',
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
            {meta?.(item) && (
              <span className="block text-[0.8125rem] text-text-muted">{meta(item)}</span>
            )}
          </span>
          {onAisle && (
            // Seul l'emoji du rayon est visible (le libellé complet ne tient pas dans 44 px) ;
            // le menu natif garde les libellés entiers.
            <span className="relative flex h-9 w-11 shrink-0 items-center justify-center rounded-md text-base hover:bg-surface-muted">
              <span aria-hidden>{t(`aisles.${item.aisle ?? 'OTHER'}`).split(' ')[0]}</span>
              <select
                aria-label={t('aisleOf', { text: item.text })}
                value={item.aisle ?? 'OTHER'}
                onChange={(e) => onAisle(item, e.target.value as Aisle)}
                className="absolute inset-0 cursor-pointer appearance-none rounded-md bg-transparent text-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&>option]:text-text"
              >
                {AISLES.map((a) => (
                  <option key={a} value={a}>
                    {t(`aisles.${a}`)}
                  </option>
                ))}
              </select>
            </span>
          )}
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
