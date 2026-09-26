'use client';

import type {
  EditScope,
  OccurrenceDto,
  TaskPriority,
  UpdateOccurrenceInput,
} from '@agenda/contracts';
import { Lock, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError, errorKey } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDuration, formatTime } from '@/lib/format';
import {
  defaultRecurrence,
  fromSeries,
  recurrenceKey,
  type RecurrenceState,
  toRecurrenceInput,
  withStartDate,
} from '@/lib/recurrence';
import {
  useCategories,
  useCreateTask,
  useDeleteOccurrence,
  useSeriesDetail,
  useUpdateOccurrence,
} from '@/lib/tasks';
import { useSession } from './household-context';
import { RecurrenceFields } from './recurrence-fields';

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

type PendingScope = { kind: 'save' | 'delete'; options: EditScope[] };

/**
 * Création et modification d'une tâche. Seul le titre est obligatoire ; le formulaire s'adapte
 * (pas d'heure sans date, pas de responsable pour une tâche personnelle, rotation si répétée).
 * Pour une tâche récurrente, la portée est demandée au moment d'enregistrer ou de supprimer.
 */
export function TaskFormDialog({
  open,
  onOpenChange,
  occurrence,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence?: OccurrenceDto | null;
  draft?: TaskDraft;
}) {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { me, household } = useSession();
  const myMemberId = household.members.find((m) => m.userId === me.id)?.id ?? '';
  const categories = useCategories(household.id);
  const series = useSeriesDetail(household.id, open ? occurrence?.seriesId : null);
  const create = useCreateTask(household.id);
  const update = useUpdateOccurrence(household.id);
  const remove = useDeleteOccurrence(household.id);
  const toast = useToast();
  const editing = Boolean(occurrence);
  const recurring = Boolean(occurrence?.seriesId);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(occurrence?.version ?? 1);
  const [pending, setPending] = useState<PendingScope | null>(null);

  const initialForm = (o?: OccurrenceDto | null, d?: TaskDraft): FormState => {
    const ids = o?.assigneeIds ?? d?.assigneeIds ?? [myMemberId];
    const minute = o?.startMinute ?? d?.startMinute;
    return {
      title: o?.title ?? d?.title ?? '',
      date: o?.date ?? d?.date ?? '',
      time: minute != null ? formatTime(minute) : '',
      duration: String(o?.durationMinutes ?? d?.durationMinutes ?? ''),
      assignee: ids.length === 0 ? 'none' : ids.length > 1 ? 'together' : ids[0]!,
      categoryId: o?.category?.id ?? d?.categoryId ?? '',
      priority: o?.priority ?? d?.priority ?? 'NORMAL',
      personal: o?.visibility === 'PERSONAL',
      notes: o?.notes ?? '',
    };
  };
  const [form, setForm] = useState<FormState>(() => initialForm(occurrence, draft));
  const [rec, setRec] = useState<RecurrenceState>(() =>
    defaultRecurrence(form.date, household.members),
  );
  const [initialRecKey, setInitialRecKey] = useState('null');
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!open) return;
    const f = initialForm(occurrence, draft);
    setForm(f);
    setVersion(occurrence?.version ?? 1);
    setError(null);
    setPending(null);
    setRec(defaultRecurrence(f.date, household.members));
    setInitialRecKey('null');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- réinitialisation à l'ouverture uniquement
  }, [open, occurrence?.id]);

  // Tâche récurrente : pré-remplit la répétition et la rotation depuis la série.
  useEffect(() => {
    if (!open || !series.data) return;
    const { state, assignee } = fromSeries(series.data, household.members);
    setRec(state);
    const f = initialForm(occurrence);
    if (state.rotation === 'fixed') f.assignee = assignee;
    setForm(f);
    setInitialRecKey(
      recurrenceKey(
        toRecurrenceInput(state, series.data.startDate, f.assignee, household.members, f.personal),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, series.data?.id, series.dataUpdatedAt]);

  const assigneeIds =
    form.assignee === 'none'
      ? []
      : form.assignee === 'together'
        ? household.members.map((m) => m.id)
        : [form.assignee];
  const canEditVisibility = !occurrence || occurrence.createdById === myMemberId;
  const recurrenceInput = useMemo(
    () => toRecurrenceInput(rec, form.date, form.assignee, household.members, form.personal),
    [rec, form.date, form.assignee, form.personal, household.members],
  );
  const seriesChanged =
    recurring &&
    recurrenceKey(
      toRecurrenceInput(
        rec,
        series.data?.startDate ?? form.date,
        form.assignee,
        household.members,
        form.personal,
      ),
    ) !== initialRecKey;
  const showAssignee = !form.personal && (rec.preset === 'none' || rec.rotation === 'fixed');

  const basePayload = () => ({
    title: form.title.trim(),
    notes: form.notes.trim() || null,
    date: form.date || null,
    startMinute: form.date ? toMinute(form.time) : null,
    durationMinutes: form.duration ? Number(form.duration) : null,
    categoryId: form.categoryId || null,
    priority: form.priority,
    visibility: form.personal ? ('PERSONAL' as const) : ('SHARED' as const),
  });

  const handleError = (err: unknown) => {
    setPending(null);
    if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
      // Modifiée entre-temps par l'autre membre : on affiche la version actuelle.
      const current = (err.details as { current?: OccurrenceDto } | undefined)?.current;
      if (current) {
        setForm(initialForm(current));
        setVersion(current.version);
      }
      setError(t('conflict'));
    } else {
      setError(te(errorKey(err) as 'generic'));
    }
  };

  const save = async (scope?: EditScope) => {
    const payload = basePayload();
    try {
      if (!occurrence) {
        await create.mutateAsync({ ...payload, assigneeIds, recurrence: recurrenceInput });
      } else if (!recurring) {
        await update.mutateAsync({
          id: occurrence.id,
          version,
          ...payload,
          assigneeIds,
          ...(recurrenceInput ? { recurrence: recurrenceInput } : {}),
        });
      } else {
        const body: UpdateOccurrenceInput & { id: string; scope: EditScope } =
          scope === 'this'
            ? { id: occurrence.id, scope, version, ...payload, assigneeIds }
            : {
                id: occurrence.id,
                scope: scope!,
                version,
                ...payload,
                // Répétition inchangée : on ne l'envoie pas, pour que la rotation continue au même tour.
                ...(seriesChanged && recurrenceInput ? { recurrence: recurrenceInput } : {}),
              };
        await update.mutateAsync(body);
      }
      onOpenChange(false);
      toast({ message: t(editing ? 'savedToast' : 'createdToast') });
    } catch (err) {
      handleError(err);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError(te('required'));
    if (rec.preset !== 'none' && !form.date) return setError(t('recurrenceNeedsDate'));
    setError(null);
    if (recurring) {
      // Une modification de la répétition ne peut pas porter sur une seule occurrence.
      setPending({
        kind: 'save',
        options: seriesChanged ? ['following', 'all'] : ['this', 'following', 'all'],
      });
    } else void save();
  };

  const doDelete = async (scope?: EditScope) => {
    if (!occurrence) return;
    try {
      await remove.mutateAsync({ id: occurrence.id, scope });
      onOpenChange(false);
      toast({ message: t('deletedToast') });
    } catch (err) {
      handleError(err);
    }
  };

  const onDelete = () => {
    if (!occurrence) return;
    if (recurring) return setPending({ kind: 'delete', options: ['this', 'following', 'all'] });
    if (window.confirm(t('confirmDelete', { title: occurrence.title }))) void doDelete();
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
        {pending ? (
          <ScopeChooser
            kind={pending.kind}
            options={pending.options}
            busy={update.isPending || remove.isPending}
            onCancel={() => setPending(null)}
            onConfirm={(scope) => (pending.kind === 'save' ? save(scope) : doDelete(scope))}
          />
        ) : recurring && series.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : (
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

            {showAssignee && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t('fields.assignee')}</span>
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
                label={t(recurring ? 'fields.occurrenceDate' : 'fields.date')}
                type="date"
                value={form.date}
                onChange={(e) => {
                  set('date', e.target.value);
                  setRec((r) => withStartDate(r, e.target.value));
                }}
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

            <RecurrenceFields
              state={rec}
              onChange={setRec}
              date={form.date}
              assignee={form.assignee}
              personal={form.personal}
              allowNone={!recurring}
            />

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
        )}
      </DialogContent>
    </Dialog>
  );
}

/** « Modifier uniquement cette occurrence ? / celle-ci et les suivantes ? / toute la série ? » */
function ScopeChooser({
  kind,
  options,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: 'save' | 'delete';
  options: EditScope[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (scope: EditScope) => void;
}) {
  const t = useTranslations('scope');
  const [scope, setScope] = useState<EditScope>(options[0]!);
  const question = t(kind === 'save' ? 'saveQuestion' : 'deleteQuestion');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9375rem]">{question}</p>
      <div role="radiogroup" aria-label={question} className="flex flex-col gap-2">
        {options.map((o) => (
          <label
            key={o}
            className={cn(
              'flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 text-[0.9375rem]',
              scope === o ? 'border-accent bg-accent/5' : 'border-border',
            )}
          >
            <input
              type="radio"
              name="scope"
              value={o}
              checked={scope === o}
              onChange={() => setScope(o)}
              className="size-4 accent-(--color-accent)"
            />
            {t(`${kind}.${o}`)}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          type="button"
          variant={kind === 'delete' ? 'danger' : 'primary'}
          loading={busy}
          onClick={() => onConfirm(scope)}
        >
          {t(kind === 'save' ? 'confirmSave' : 'confirmDelete')}
        </Button>
      </div>
    </div>
  );
}
