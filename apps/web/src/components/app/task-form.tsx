'use client';

import type { OccurrenceDto, TaskPriority } from '@agenda/contracts';
import { Lock, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { ApiError, errorKey } from '@/lib/api';
import { formatDuration, formatTime } from '@/lib/format';
import {
  useCategories,
  useCreateTask,
  useDeleteOccurrence,
  useUpdateOccurrence,
} from '@/lib/tasks';
import { useSession } from './household-context';

export interface TaskDraft {
  title?: string;
  date?: string | null;
  startMinute?: number | null;
  durationMinutes?: number | null;
  assigneeIds?: string[];
  categoryId?: string | null;
  priority?: TaskPriority;
}

interface FormState {
  title: string;
  date: string;
  time: string;
  duration: string;
  assignee: string; // memberId | 'together' | 'none'
  categoryId: string;
  priority: TaskPriority;
  personal: boolean;
  notes: string;
}

const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

function toMinute(time: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Création et modification d'une tâche. Seul le titre est obligatoire ;
 * le formulaire s'adapte (pas d'heure sans date, pas de responsable pour une tâche personnelle).
 */
export function TaskFormDialog({
  open,
  onOpenChange,
  occurrence,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Présent = modification. */
  occurrence?: OccurrenceDto | null;
  /** Valeurs initiales pour une création (ex. issues du quick add). */
  draft?: TaskDraft;
}) {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { me, household } = useSession();
  const myMemberId = household.members.find((m) => m.userId === me.id)?.id ?? '';
  const categories = useCategories(household.id);
  const create = useCreateTask(household.id);
  const update = useUpdateOccurrence(household.id);
  const remove = useDeleteOccurrence(household.id);
  const toast = useToast();
  const editing = Boolean(occurrence);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(occurrence?.version ?? 1);

  const initial = (o?: OccurrenceDto | null, d?: TaskDraft): FormState => {
    const ids = o?.assigneeIds ?? d?.assigneeIds ?? [myMemberId];
    return {
      title: o?.title ?? d?.title ?? '',
      date: o?.date ?? d?.date ?? '',
      time:
        (o?.startMinute ?? d?.startMinute) != null
          ? formatTime((o?.startMinute ?? d?.startMinute)!)
          : '',
      duration: String(o?.durationMinutes ?? d?.durationMinutes ?? ''),
      assignee: ids.length === 0 ? 'none' : ids.length > 1 ? 'together' : ids[0]!,
      categoryId: o?.category?.id ?? d?.categoryId ?? '',
      priority: o?.priority ?? d?.priority ?? 'NORMAL',
      personal: o?.visibility === 'PERSONAL',
      notes: o?.notes ?? '',
    };
  };
  const [form, setForm] = useState<FormState>(() => initial(occurrence, draft));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (open) {
      setForm(initial(occurrence, draft));
      setVersion(occurrence?.version ?? 1);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- réinitialisation à l'ouverture uniquement
  }, [open, occurrence?.id]);

  const assigneeIds =
    form.assignee === 'none'
      ? []
      : form.assignee === 'together'
        ? household.members.map((m) => m.id)
        : [form.assignee];
  const canEditVisibility = !occurrence || occurrence.createdById === myMemberId;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(te('required'));
      return;
    }
    setError(null);
    const payload = {
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      date: form.date || null,
      startMinute: form.date ? toMinute(form.time) : null,
      durationMinutes: form.duration ? Number(form.duration) : null,
      assigneeIds,
      categoryId: form.categoryId || null,
      priority: form.priority,
      visibility: form.personal ? ('PERSONAL' as const) : ('SHARED' as const),
    };
    try {
      if (occurrence) await update.mutateAsync({ id: occurrence.id, version, ...payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
      toast({ message: t(editing ? 'savedToast' : 'createdToast') });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        // Modifiée entre-temps par l'autre membre : on affiche la version actuelle.
        const current = (err.details as { current?: OccurrenceDto } | undefined)?.current;
        if (current) {
          setForm(initial(current));
          setVersion(current.version);
        }
        setError(t('conflict'));
      } else {
        setError(te(errorKey(err) as 'generic'));
      }
    }
  };

  const onDelete = async () => {
    if (!occurrence || !window.confirm(t('confirmDelete', { title: occurrence.title }))) return;
    try {
      await remove.mutateAsync(occurrence.id);
      onOpenChange(false);
      toast({ message: t('deletedToast') });
    } catch (err) {
      setError(te(errorKey(err) as 'generic'));
    }
  };

  const assigneeOptions = [
    ...household.members.map((m) => ({ value: m.id, label: m.displayName })),
    ...(household.members.length > 1
      ? [{ value: 'together', label: t(household.members.length === 2 ? 'bothOfUs' : 'everyone') }]
      : []),
    { value: 'none', label: t('unassigned') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t(editing ? 'editTitle' : 'newTitle')} closeLabel={tc('close')}>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <Field
            label={t('fields.title')}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={t('fields.titlePlaceholder')}
            maxLength={200}
            autoFocus={!editing}
            required
          />

          {!form.personal && (
            <div className="flex flex-col gap-1.5">
              <span id="assignee-label" className="text-sm font-medium">
                {t('fields.assignee')}
              </span>
              <Segmented
                label={t('fields.assignee')}
                options={assigneeOptions}
                value={form.assignee}
                onChange={(v) => set('assignee', v)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field
              label={t('fields.date')}
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
            <Field
              label={t('fields.time')}
              type="time"
              step={300}
              value={form.time}
              disabled={!form.date}
              hint={!form.date ? t('fields.timeNeedsDate') : undefined}
              onChange={(e) => set('time', e.target.value)}
            />
            <Select
              label={t('fields.duration')}
              value={form.duration}
              onChange={(e) => set('duration', e.target.value)}
            >
              <option value="">—</option>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {formatDuration(d)}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('fields.category')}
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">{t('fields.noCategory')}</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ''}
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label={t('fields.priority')}
              value={form.priority}
              onChange={(e) => set('priority', e.target.value as TaskPriority)}
            >
              {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}`)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-notes" className="text-sm font-medium">
              {t('fields.notes')}
            </label>
            <textarea
              id="task-notes"
              value={form.notes}
              maxLength={5000}
              rows={2}
              onChange={(e) => set('notes', e.target.value)}
              className="min-h-11 rounded-md border border-border bg-surface px-3 py-2.5 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
          </div>

          {canEditVisibility && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem]">
              <input
                type="checkbox"
                checked={form.personal}
                onChange={(e) => set('personal', e.target.checked)}
                className="size-5 accent-(--color-accent)"
              />
              <Lock aria-hidden className="size-4 text-text-muted" />
              <span>
                {t('fields.personal')}
                <span className="block text-[0.8125rem] text-text-muted">
                  {t('fields.personalHint')}
                </span>
              </span>
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onDelete}
                loading={remove.isPending}
                className="text-danger"
              >
                <Trash2 aria-hidden className="size-4" />
                {t('delete')}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" loading={create.isPending || update.isPending}>
              {t(editing ? 'save' : 'create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
