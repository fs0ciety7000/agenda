'use client';

import categoryIcons from '@agenda/design-tokens/category-icons';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';

export type CategoryIconKey = categoryIcons.CategoryIconKey;

/** Icône associée à un émoji enregistré (les catégories gardent l'émoji en base). */
export function iconForEmoji(emoji: string | null | undefined): CategoryIconKey | null {
  if (!emoji) return null;
  const e = emoji.trim();
  return categoryIcons.byEmoji[e] ?? categoryIcons.byEmoji[e.replace(/\uFE0F/g, '')] ?? null;
}

/** Émoji enregistré pour une icône choisie (le premier de sa liste). */
export const emojiForIcon = (key: CategoryIconKey) => categoryIcons.icons[key].emoji[0]!;

export const aisleIcon = (aisle: string): CategoryIconKey =>
  categoryIcons.aisles[aisle] ?? 'groceries';
export const expenseIcon = (category: string): CategoryIconKey =>
  categoryIcons.expenses[category] ?? 'box';

/**
 * Icône maison au trait (packages/design-tokens/category-icons.json, mêmes tracés sur Android) :
 * le trait principal suit la couleur du texte (accent par défaut), le détail est abricot.
 * Un émoji sans icône connue reste affiché tel quel, pour ne rien perdre.
 */
export function CategoryIcon({
  icon,
  emoji,
  className,
}: {
  icon?: CategoryIconKey | null;
  emoji?: string | null;
  className?: string;
}) {
  const key = icon ?? iconForEmoji(emoji);
  if (!key) {
    return emoji ? (
      <span aria-hidden className={cn('inline-block text-center leading-none', className)}>
        {emoji}
      </span>
    ) : null;
  }
  const glyph = categoryIcons.icons[key];
  const v = categoryIcons.viewBox;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${v} ${v}`}
      className={cn('inline-block size-5 shrink-0 text-accent', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={categoryIcons.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph.paths.map((d) => (
        <path key={d} d={d} />
      ))}
      {glyph.accent.map((d) => (
        <path key={d} d={d} stroke="var(--gn-brand-apricot)" />
      ))}
    </svg>
  );
}

/**
 * Choix de l'icône d'une catégorie ou d'un modèle : un bouton qui déplie la grille.
 * La valeur reste l'émoji enregistré (`null` = sans icône).
 */
export function CategoryIconPicker({
  value,
  onChange,
  label,
  showLabel = false,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
  label: string;
  /** Libellé visible au-dessus du bouton (formulaires à champs étiquetés). */
  showLabel?: boolean;
}) {
  const t = useTranslations('icons');
  const [open, setOpen] = useState(false);
  const gridId = useId();
  const current = iconForEmoji(value);
  const choose = (emoji: string | null) => {
    onChange(emoji);
    setOpen(false);
  };
  const cell =
    'inline-flex size-11 items-center justify-center rounded-md border hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const trigger = (
    <button
      type="button"
      aria-label={`${label}, ${current ? t(current) : value || t('none')}`}
      aria-expanded={open}
      aria-controls={gridId}
      onClick={() => setOpen((o) => !o)}
      className={cn(cell, 'border-border-strong bg-surface')}
    >
      <CategoryIcon emoji={value} className="size-5" />
      {!value && <span className="size-2 rounded-full bg-border-strong" />}
    </button>
  );
  return (
    <div className="contents">
      {showLabel ? (
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="text-sm font-medium text-text">
            {label}
          </span>
          {trigger}
        </div>
      ) : (
        trigger
      )}
      {open && (
        <div
          id={gridId}
          role="group"
          aria-label={label}
          className="order-last flex basis-full flex-wrap gap-1.5 rounded-lg border border-border bg-surface p-2"
        >
          {categoryIcons.picker.map((key) => {
            const selected = current === key;
            return (
              <button
                key={key}
                type="button"
                title={t(key)}
                aria-label={t(key)}
                aria-pressed={selected}
                onClick={() => choose(emojiForIcon(key))}
                className={cn(
                  cell,
                  selected ? 'border-accent bg-surface-muted' : 'border-transparent',
                )}
              >
                <CategoryIcon icon={key} />
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={!value}
            onClick={() => choose(null)}
            className={cn(
              cell,
              'w-auto px-3 text-[0.8125rem] text-text-muted',
              !value ? 'border-accent bg-surface-muted' : 'border-transparent',
            )}
          >
            {t('none')}
          </button>
        </div>
      )}
    </div>
  );
}
