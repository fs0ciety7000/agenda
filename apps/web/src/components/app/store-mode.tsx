'use client';

import type { ShoppingItemDto } from '@agenda/contracts';
import { AISLES } from '@agenda/domain';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

/**
 * Mode magasin : plein écran, gros caractères, rangé par rayon, écran maintenu allumé
 * (Wake Lock, quand le navigateur le permet). Toucher une ligne la met dans le panier.
 */
export function StoreMode({
  items,
  onToggle,
  onClose,
}: {
  items: ShoppingItemDto[];
  onToggle: (item: ShoppingItemDto) => void;
  onClose: () => void;
}) {
  const t = useTranslations('shopping');
  const tc = useTranslations('common');
  const toBuy = items.filter((i) => !i.done);
  const inCart = items.filter((i) => i.done);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    const acquire = () =>
      nav.wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => undefined);
    void acquire();
    // L'écran se reverrouille si l'onglet passe en arrière-plan : on redemande au retour.
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  const row = (i: ShoppingItemDto) => (
    <li key={i.id}>
      <button
        type="button"
        role="checkbox"
        aria-checked={i.done}
        onClick={() => onToggle(i)}
        className={cn(
          'flex min-h-16 w-full items-center gap-4 rounded-lg border border-border bg-surface px-4 text-left text-xl',
          i.done && 'text-text-muted',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full border-2',
            i.done ? 'border-success bg-success text-surface' : 'border-border-strong',
          )}
        >
          {i.done && <Check className="size-5 stroke-[3]" />}
        </span>
        <span className={cn('min-w-0 flex-1 break-words', i.done && 'line-through')}>
          {i.text}
          {i.quantity && <span className="ml-2 text-base text-text-muted">{i.quantity}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t('storeTitle')}
        description={t('storeLeft', { count: toBuy.length })}
        closeLabel={tc('close')}
        className="inset-0 h-dvh max-h-none rounded-none sm:inset-0 sm:top-0 sm:left-0 sm:max-w-none sm:translate-x-0 sm:rounded-none"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          {toBuy.length === 0 ? (
            <p className="text-xl">{t('allDone')}</p>
          ) : (
            AISLES.map((aisle) => {
              const inAisle = toBuy.filter((i) => (i.aisle ?? 'OTHER') === aisle);
              if (!inAisle.length) return null;
              return (
                <section
                  key={aisle}
                  aria-label={t(`aisles.${aisle}`)}
                  className="flex flex-col gap-2"
                >
                  <h3 className="text-base font-medium text-text-muted">{t(`aisles.${aisle}`)}</h3>
                  <ul className="flex flex-col gap-2">{inAisle.map(row)}</ul>
                </section>
              );
            })
          )}
          {inCart.length > 0 && (
            <section
              aria-label={t('inCart', { count: inCart.length })}
              className="flex flex-col gap-2"
            >
              <h3 className="text-base font-medium text-text-muted">
                {t('inCart', { count: inCart.length })}
              </h3>
              <ul className="flex flex-col gap-2">{inCart.map(row)}</ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
