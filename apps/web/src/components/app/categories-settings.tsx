'use client';

import type { CategoryDto } from '@agenda/contracts';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import { useCategories, useCategoryMutations } from '@/lib/tasks';
import { useSession } from './household-context';

const inputClass =
  'h-10 rounded-md border border-border bg-surface px-3 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';

function CategoryEditor({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  pending,
}: {
  initial?: CategoryDto;
  submitLabel: string;
  onSubmit: (v: { name: string; emoji: string | null }) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const t = useTranslations('categories');
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit({ name: name.trim(), emoji: emoji.trim() || null });
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        aria-label={t('emoji')}
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        maxLength={16}
        placeholder="🏷️"
        className={`${inputClass} w-14 text-center`}
      />
      <input
        aria-label={t('name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder={t('name')}
        className={`${inputClass} min-w-0 flex-1`}
        required
      />
      <Button type="submit" size="sm" loading={pending}>
        {submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
      )}
    </form>
  );
}

/** Catégories configurables par le foyer (renommer, emoji, ajouter, supprimer). */
export function CategoriesSettings() {
  const t = useTranslations('categories');
  const te = useTranslations('errors');
  const { household } = useSession();
  const categories = useCategories(household.id);
  const { create, update, remove } = useCategoryMutations(household.id);
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const onError = (e: unknown) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' });

  if (!categories.data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border">
        {categories.data.map((c) => (
          <li key={c.id} className="flex min-h-12 items-center gap-3 py-1.5">
            {editing === c.id ? (
              <div className="flex-1">
                <CategoryEditor
                  initial={c}
                  submitLabel={t('save')}
                  pending={update.isPending}
                  onCancel={() => setEditing(null)}
                  onSubmit={(v) =>
                    update.mutate(
                      { id: c.id, ...v },
                      { onSuccess: () => setEditing(null), onError },
                    )
                  }
                />
              </div>
            ) : (
              <>
                <span aria-hidden className="w-6 text-center">
                  {c.emoji}
                </span>
                <span className="flex-1 text-[0.9375rem]">{c.name}</span>
                <button
                  type="button"
                  onClick={() => setEditing(c.id)}
                  aria-label={t('rename', { name: c.name })}
                  className="inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
                >
                  <Pencil aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('confirmDelete', { name: c.name })))
                      remove.mutate(c.id, { onError });
                  }}
                  aria-label={t('delete', { name: c.name })}
                  className="inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-danger"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Plus aria-hidden className="size-4" />
          {t('add')}
        </p>
        <CategoryEditor
          key={categories.data.length}
          submitLabel={t('addButton')}
          pending={create.isPending}
          onSubmit={(v) => create.mutate(v, { onError })}
        />
      </div>
    </div>
  );
}
