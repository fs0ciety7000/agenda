'use client';

import type { QuickAddPreview } from '@agenda/contracts';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { onlineManager } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import { formatDuration, formatTime, useDayLabel, useDueLabel } from '@/lib/format';
import { parseQuickAdd, useCategories, useQuickAdd } from '@/lib/tasks';
import { useAssigneeLabel } from './assignees';
import { useSession } from './household-context';
import type { TaskDraft } from './task-form';

/**
 * « + Sortir les poubelles demain 19h » → Entrée. L'analyse est faite par l'API (même résultat
 * sur Android) ; l'aperçu s'affiche pendant la frappe, sous forme de puces.
 */
export function QuickAdd({
  onMoreOptions,
  extra,
}: {
  onMoreOptions: (draft: TaskDraft) => void;
  /** Action secondaire affichée à droite, sous le champ (ex. « Utiliser un modèle »). */
  extra?: React.ReactNode;
}) {
  const t = useTranslations('quickAdd');
  const te = useTranslations('errors');
  const { household } = useSession();
  const categories = useCategories(household.id);
  const assigneeLabel = useAssigneeLabel(household);
  const dayLabel = useDayLabel();
  const dueLabel = useDueLabel();
  const quickAdd = useQuickAdd(household.id);
  const toast = useToast();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<QuickAddPreview | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Raccourci « N » : nouvelle tâche (hors champ de saisie).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.key.toLowerCase() === 'n' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !target.closest('input, textarea, select, [contenteditable]')
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      parseQuickAdd(household.id, text, controller.signal).then(setPreview, () => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, household.id]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || (quickAdd.isPending && !quickAdd.isPaused)) return;
    const offline = !onlineManager.isOnline();
    quickAdd.mutate(
      { hid: household.id, text, key: crypto.randomUUID() },
      {
        onSuccess: (o) => {
          setText('');
          setPreview(null);
          if (!offline) toast({ message: t('added', { title: o.title }) });
        },
        onError: (err) => toast({ message: te(errorKey(err) as 'generic'), tone: 'error' }),
      },
    );
    // Hors ligne : mise en file, envoyée au retour du réseau (sans doublon).
    if (offline) {
      setText('');
      setPreview(null);
      toast({ message: t('queued', { text: text.trim() }) });
    }
  };

  const chips: string[] = [];
  if (preview?.date) chips.push(dayLabel(preview.date));
  if (preview?.dueDate) chips.push(dueLabel(preview.dueDate));
  if (preview?.startMinute != null) chips.push(formatTime(preview.startMinute));
  if (preview?.durationMinutes) chips.push(formatDuration(preview.durationMinutes));
  if (preview?.assigneeIds) chips.push(assigneeLabel(preview.assigneeIds));
  if (preview?.categoryId) {
    const c = categories.data?.find((x) => x.id === preview.categoryId);
    if (c) chips.push(`${c.emoji ?? ''} ${c.name}`.trim());
  }
  if (preview?.priority === 'HIGH' || preview?.priority === 'URGENT')
    chips.push(t(`priority.${preview.priority}`));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface pl-3 pr-1 focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent">
        <Plus aria-hidden className="size-5 shrink-0 text-text-muted" />
        <label htmlFor="quick-add" className="sr-only">
          {t('label')}
        </label>
        <input
          ref={inputRef}
          id="quick-add"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={500}
          aria-describedby="quick-add-preview"
          className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-text-muted"
        />
        <button
          type="button"
          onClick={() =>
            onMoreOptions({
              title: preview?.title ?? text,
              date: preview?.date,
              dueDate: preview?.dueDate,
              startMinute: preview?.startMinute,
              durationMinutes: preview?.durationMinutes,
              assigneeIds: preview?.assigneeIds,
              categoryId: preview?.categoryId,
              priority: preview?.priority,
            })
          }
          aria-label={t('moreOptions')}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
        >
          <SlidersHorizontal aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex min-h-6 items-start justify-between gap-2">
        <div
          id="quick-add-preview"
          aria-live="polite"
          className="flex flex-wrap gap-1.5 px-1 pt-0.5"
        >
          {chips.length > 0 && (
            <>
              <span className="sr-only">{t('previewLabel')}</span>
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-surface-muted px-2.5 py-0.5 text-[0.8125rem] text-text-muted"
                >
                  {chip}
                </span>
              ))}
            </>
          )}
        </div>
        {extra}
      </div>
    </form>
  );
}
