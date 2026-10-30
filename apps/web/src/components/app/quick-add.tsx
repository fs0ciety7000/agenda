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
  defaultDate,
  placeholder,
}: {
  onMoreOptions: (draft: TaskDraft) => void;
  /** Action secondaire affichée à droite, sous le champ (ex. « Utiliser un modèle »). */
  extra?: React.ReactNode;
  /** Jour choisi (calendrier) : la tâche y va si la phrase ne donne pas de date. */
  defaultDate?: string;
  /** « Qu'est-ce qu'on fait jeudi ? » ; sinon l'invite générale. */
  placeholder?: string;
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
      parseQuickAdd(household.id, text, controller.signal, defaultDate).then(setPreview, () => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, household.id, defaultDate]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || (quickAdd.isPending && !quickAdd.isPaused)) return;
    const offline = !onlineManager.isOnline();
    quickAdd.mutate(
      { hid: household.id, text, key: crypto.randomUUID(), defaultDate },
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

  const previewChips = (
    <div id="quick-add-preview" aria-live="polite" className="flex flex-wrap gap-1.5 px-1">
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
  );

  // Mobile : barre fixée en bas, au-dessus des onglets, à portée du pouce (aperçu au-dessus).
  // Desktop : en haut de la page, aperçu dessous.
  return (
    <>
      <form
        onSubmit={onSubmit}
        // Repère des toasts : sur téléphone, ils s'affichent au-dessus de cette barre.
        data-dock
        className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex flex-col-reverse gap-2 bg-[linear-gradient(to_top,var(--color-bg)_75%,transparent)] px-4 pb-3 pt-4 md:static md:bg-none md:z-auto md:flex-col md:p-0"
      >
        <div className="flex h-14 items-center gap-3 rounded-full border border-border bg-surface pl-5 pr-2 shadow-raised focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent">
          <Plus aria-hidden className="size-5 shrink-0 stroke-[2.2] text-text" />
          <label htmlFor="quick-add" className="sr-only">
            {t('label')}
          </label>
          <input
            ref={inputRef}
            id="quick-add"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder ?? t('placeholder')}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={500}
            aria-describedby="quick-add-preview"
            className="h-full min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-text-muted"
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
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text hover:bg-border"
          >
            <SlidersHorizontal aria-hidden className="size-4" />
          </button>
        </div>
        <div className="flex items-start justify-between gap-2 md:min-h-6">
          {previewChips}
          {extra && <div className="hidden md:block">{extra}</div>}
        </div>
      </form>
      {/* Mobile : l'action secondaire reste dans la page, et la barre fixe ne cache pas la fin. */}
      {extra && <div className="-mt-4 flex justify-end md:hidden">{extra}</div>}
      <div aria-hidden className="order-last h-16 md:hidden" />
    </>
  );
}
