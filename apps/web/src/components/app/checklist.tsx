'use client';

import { Check, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export interface ChecklistRow {
  key: string;
  text: string;
  done: boolean;
}

/**
 * Sous-tâches / liste (ex. courses) : cases à cocher, ajout rapide (Entrée), retrait.
 * Même composant à la création (liste locale) et en modification (enregistré à chaque action).
 */
export function ChecklistEditor({
  items,
  onAdd,
  onToggle,
  onRemove,
  canToggle = true,
  busy = false,
}: {
  items: ChecklistRow[];
  onAdd: (text: string) => void;
  onToggle: (key: string, done: boolean) => void;
  onRemove: (key: string) => void;
  canToggle?: boolean;
  busy?: boolean;
}) {
  const t = useTranslations('checklist');
  const [text, setText] = useState('');
  const inputId = useId();
  const done = items.filter((i) => i.done).length;

  const add = () => {
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Entrée ajoute l'article au lieu d'enregistrer tout le formulaire.
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 flex w-full items-baseline justify-between text-sm font-medium">
        {t('title')}
        {items.length > 0 && (
          <span className="text-[0.8125rem] font-normal tabular-nums text-text-muted">
            {t('progress', { done, total: items.length })}
          </span>
        )}
      </legend>
      {items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.key} className="group flex min-h-11 items-center gap-2">
              {canToggle ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={item.done}
                  aria-label={item.text}
                  onClick={() => onToggle(item.key, !item.done)}
                  className="-m-1.5 flex size-11 shrink-0 items-center justify-center rounded-md"
                >
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-sm border-[1.5px]',
                      item.done ? 'border-success bg-success text-surface' : 'border-text-muted/70',
                    )}
                  >
                    {item.done && <Check aria-hidden className="size-3.5 stroke-[3]" />}
                  </span>
                </button>
              ) : (
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-text-muted/50" />
              )}
              <span
                className={cn(
                  'min-w-0 flex-1 break-words text-[0.9375rem]',
                  item.done && 'text-text-muted line-through',
                )}
              >
                {item.text}
              </span>
              <button
                type="button"
                aria-label={t('remove', { text: item.text })}
                onClick={() => onRemove(item.key)}
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:text-text"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('newItem')}
        </label>
        <input
          id={inputId}
          value={text}
          maxLength={200}
          placeholder={t('placeholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !text.trim()}
          aria-label={t('add')}
          title={t('add')}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border disabled:opacity-50"
        >
          <Plus aria-hidden className="size-5" />
        </button>
      </div>
    </fieldset>
  );
}
