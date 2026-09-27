'use client';

import type { TaskTemplateDto, TemplateItem } from '@agenda/contracts';
import { addDays, postponeWeekend } from '@agenda/domain';
import { LayoutTemplate, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import { formatTime, useToday } from '@/lib/format';
import { useTemplateMutations, useTemplates } from '@/lib/templates';
import { useCategories } from '@/lib/tasks';
import { useSession } from './household-context';

type ItemForm = {
  title: string;
  assignee: string;
  time: string;
  duration: string;
  categoryId: string;
};

const toForm = (i: TemplateItem): ItemForm => ({
  title: i.title,
  assignee:
    i.assigneeIds.length === 0 ? 'none' : i.assigneeIds.length > 1 ? 'together' : i.assigneeIds[0]!,
  time: i.startMinute != null ? formatTime(i.startMinute) : '',
  duration: i.durationMinutes ? String(i.durationMinutes) : '',
  categoryId: i.categoryId ?? '',
});

const emptyItem = (): ItemForm => ({
  title: '',
  assignee: 'none',
  time: '',
  duration: '',
  categoryId: '',
});

/** Modèles du foyer (Réglages) : créer, modifier, supprimer. */
export function TemplatesSettings() {
  const t = useTranslations('templates');
  const te = useTranslations('errors');
  const { household } = useSession();
  const templates = useTemplates(household.id);
  const { remove } = useTemplateMutations(household.id);
  const toast = useToast();
  const [editing, setEditing] = useState<TaskTemplateDto | 'new' | null>(null);

  if (!templates.data) return <Skeleton className="h-24 w-full" />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-muted">{t('hint')}</p>
      {templates.data.length > 0 && (
        <ul className="divide-y divide-border">
          {templates.data.map((tpl) => (
            <li key={tpl.id} className="flex min-h-12 items-center gap-3 py-1.5">
              <span aria-hidden className="w-6 text-center">
                {tpl.emoji}
              </span>
              <span className="flex-1">
                <span className="block text-[0.9375rem]">{tpl.name}</span>
                <span className="block text-[0.8125rem] text-text-muted">
                  {tpl.items.map((i) => i.title).join(' · ')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setEditing(tpl)}
                aria-label={t('edit', { name: tpl.name })}
                className="inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
              >
                <Pencil aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t('confirmDelete', { name: tpl.name })))
                    remove.mutate(tpl.id, {
                      onError: (e) =>
                        toast({ message: te(errorKey(e) as 'generic'), tone: 'error' }),
                    });
                }}
                aria-label={t('delete', { name: tpl.name })}
                className="inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-danger"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus aria-hidden className="size-4" />
          {t('new')}
        </Button>
      </div>
      {editing && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
}: {
  template: TaskTemplateDto | null;
  onClose: () => void;
}) {
  const t = useTranslations('templates');
  const tt = useTranslations('tasks');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const { household } = useSession();
  const categories = useCategories(household.id);
  const { save } = useTemplateMutations(household.id);
  const [name, setName] = useState(template?.name ?? '');
  const [emoji, setEmoji] = useState(template?.emoji ?? '');
  const [items, setItems] = useState<ItemForm[]>(template?.items.map(toForm) ?? [emptyItem()]);
  const [error, setError] = useState<string | null>(null);
  const setItem = (i: number, patch: Partial<ItemForm>) =>
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const filled = items.filter((i) => i.title.trim());
    if (!name.trim() || filled.length === 0) return setError(t('required'));
    save.mutate(
      {
        id: template?.id,
        name: name.trim(),
        emoji: emoji.trim() || null,
        items: filled.map((i) => ({
          title: i.title.trim(),
          assigneeIds:
            i.assignee === 'none'
              ? []
              : i.assignee === 'together'
                ? household.members.map((mb) => mb.id)
                : [i.assignee],
          startMinute: i.time ? Number(i.time.slice(0, 2)) * 60 + Number(i.time.slice(3, 5)) : null,
          durationMinutes: i.duration ? Number(i.duration) : null,
          categoryId: i.categoryId || null,
        })),
      },
      { onSuccess: onClose, onError: (err) => setError(te(errorKey(err) as 'generic')) },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t(template ? 'editTitle' : 'newTitle')} closeLabel={tc('close')}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-[4.5rem_1fr] gap-3">
            <Field
              label={t('emoji')}
              value={emoji}
              maxLength={8}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🧹"
            />
            <Field
              label={t('name')}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              required
            />
          </div>
          <ol className="flex flex-col gap-4" aria-label={t('items')}>
            {items.map((item, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field
                      label={t('itemTitle', { n: i + 1 })}
                      value={item.title}
                      maxLength={200}
                      onChange={(e) => setItem(i, { title: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={t('removeItem', { n: i + 1 })}
                    disabled={items.length <= 1}
                    onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                    className="inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted disabled:opacity-40"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Select
                    label={tt('fields.assignee')}
                    value={item.assignee}
                    onChange={(e) => setItem(i, { assignee: e.target.value })}
                  >
                    <option value="none">{tt('unassigned')}</option>
                    {household.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                    {household.members.length > 1 && (
                      <option value="together">
                        {tt(household.members.length === 2 ? 'bothOfUs' : 'everyone')}
                      </option>
                    )}
                  </Select>
                  <Field
                    label={tt('fields.time')}
                    type="time"
                    step={300}
                    value={item.time}
                    onChange={(e) => setItem(i, { time: e.target.value })}
                  />
                  <Field
                    label={tt('fields.duration')}
                    type="number"
                    min={1}
                    max={1440}
                    value={item.duration}
                    onChange={(e) => setItem(i, { duration: e.target.value })}
                  />
                  <Select
                    label={tt('fields.category')}
                    value={item.categoryId}
                    onChange={(e) => setItem(i, { categoryId: e.target.value })}
                  >
                    <option value="">—</option>
                    {(categories.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {[c.emoji, c.name].filter(Boolean).join(' ')}
                      </option>
                    ))}
                  </Select>
                </div>
              </li>
            ))}
          </ol>
          {items.length < 30 && (
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setItems((l) => [...l, emptyItem()])}
              >
                <Plus aria-hidden className="size-4" />
                {t('addItem')}
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>
              {t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** « Utiliser un modèle » : choisir le modèle et le jour, créer toutes ses tâches d'un coup. */
export function ApplyTemplateButton() {
  const t = useTranslations('templates');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { household } = useSession();
  const templates = useTemplates(household.id);
  const { apply } = useTemplateMutations(household.id);
  const toast = useToast();
  const today = useToday();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [when, setWhen] = useState<'today' | 'tomorrow' | 'weekend' | 'date' | 'none'>('today');
  const [date, setDate] = useState(today);

  const list = templates.data ?? [];
  const chosen = list.find((x) => x.id === templateId) ?? list[0];
  const targetDate =
    when === 'today'
      ? today
      : when === 'tomorrow'
        ? addDays(today, 1)
        : when === 'weekend'
          ? postponeWeekend(addDays(today, -1))
          : when === 'date'
            ? date
            : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    apply.mutate(
      { id: chosen.id, date: targetDate },
      {
        onSuccess: (created) => {
          setOpen(false);
          toast({ message: t('applied', { count: created.length, name: chosen.name }) });
        },
        onError: (err) => toast({ message: te(errorKey(err) as 'generic'), tone: 'error' }),
      },
    );
  };

  if (list.length === 0) return null;
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="self-start">
        <LayoutTemplate aria-hidden className="size-4" />
        {t('use')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('useTitle')} closeLabel={tc('close')}>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Select
              label={t('template')}
              value={chosen?.id ?? ''}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {list.map((x) => (
                <option key={x.id} value={x.id}>
                  {[x.emoji, x.name].filter(Boolean).join(' ')}
                </option>
              ))}
            </Select>
            {chosen && (
              <p className="text-sm text-text-muted">
                {chosen.items.map((i) => i.title).join(' · ')}
              </p>
            )}
            <Select
              label={t('when')}
              value={when}
              onChange={(e) => setWhen(e.target.value as typeof when)}
            >
              <option value="today">{t('whenToday')}</option>
              <option value="tomorrow">{t('whenTomorrow')}</option>
              <option value="weekend">{t('whenWeekend')}</option>
              <option value="date">{t('whenDate')}</option>
              <option value="none">{t('whenNone')}</option>
            </Select>
            {when === 'date' && (
              <Field
                label={t('date')}
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={apply.isPending}>
                {t('create', { count: chosen?.items.length ?? 0 })}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
