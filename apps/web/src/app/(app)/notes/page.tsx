'use client';

import type { NoteDto } from '@agenda/contracts';
import { Copy, Pencil, Pin, Plus, StickyNote } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useSession } from '@/components/app/household-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError, errorKey } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useOnline } from '@/lib/offline';
import { useNoteActions, useNotes } from '@/lib/notes';

type Editing = { note: NoteDto | null; title: string; body: string; pinned: boolean };

/** Notes partagées : codes, mesures, idées cadeaux. Épinglées d'abord, modifiables par chacun. */
export default function NotesPage() {
  const t = useTranslations('notes');
  const te = useTranslations('errors');
  const toast = useToast();
  const { household } = useSession();
  const notes = useNotes(household.id);
  const actions = useNoteActions(household.id);
  const online = useOnline();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [conflict, setConflict] = useState(false);

  const fail = (e: unknown) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' });
  const open = (note: NoteDto | null) => {
    setConflict(false);
    setEditing({
      note,
      title: note?.title ?? '',
      body: note?.body ?? '',
      pinned: note?.pinned ?? false,
    });
  };
  const togglePin = (n: NoteDto) =>
    actions.update.mutate({ id: n.id, pinned: !n.pinned, version: n.version }, { onError: fail });
  const copy = async (n: NoteDto) => {
    try {
      await navigator.clipboard.writeText(n.body || n.title);
      toast({ message: t('copied', { title: n.title }) });
    } catch {
      toast({ message: t('copyFailed'), tone: 'error' });
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const { note, title, body, pinned } = editing;
    const done = () => {
      setEditing(null);
      toast({ message: t(note ? 'saved' : 'created') });
    };
    if (!note) {
      actions.create.mutate({ title, body, pinned }, { onSuccess: done, onError: fail });
      return;
    }
    actions.update.mutate(
      { id: note.id, title, body, pinned, version: note.version },
      {
        onSuccess: done,
        onError: (err) => {
          // Modifiée par l'autre entre-temps : sa version s'affiche, on peut réenregistrer.
          const current = (err instanceof ApiError &&
            err.code === 'VERSION_CONFLICT' &&
            (err.details as { current?: NoteDto } | undefined)?.current) as NoteDto | undefined;
          if (current) {
            setConflict(true);
            setEditing({ note: current, ...current });
          } else fail(err);
        },
      },
    );
  };
  const remove = (note: NoteDto) =>
    actions.remove.mutate(note.id, {
      onSuccess: () => {
        setEditing(null);
        toast({
          message: t('deleted', { title: note.title }),
          action: {
            label: t('undo'),
            onClick: () =>
              actions.create.mutate(
                { title: note.title, body: note.body, pinned: note.pinned },
                { onError: fail },
              ),
          },
        });
      },
      onError: fail,
    });

  const list = notes.data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{t('title')}</h1>
        {list.length > 0 && (
          <Button onClick={() => open(null)} disabled={!online}>
            <Plus aria-hidden className="size-4" />
            {t('new')}
          </Button>
        )}
      </div>
      {!online && <p className="text-sm text-text-muted">{t('offline')}</p>}

      {notes.error ? (
        <ErrorState
          message={te(errorKey(notes.error) as 'generic')}
          retryLabel={te('retry')}
          onRetry={() => void notes.refetch()}
        />
      ) : !notes.data ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={StickyNote}
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={
              <Button onClick={() => open(null)} disabled={!online}>
                <Plus aria-hidden className="size-4" />
                {t('new')}
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label={t('title')}>
          {list.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              disabled={!online}
              onEdit={() => open(n)}
              onPin={() => togglePin(n)}
              onCopy={() => void copy(n)}
            />
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={t(editing.note ? 'edit' : 'new')} closeLabel={t('close')}>
            <form onSubmit={save} className="flex flex-col gap-4" noValidate>
              {conflict && (
                <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm">
                  {t('conflict')}
                </p>
              )}
              <Field
                label={t('fieldTitle')}
                value={editing.title}
                maxLength={120}
                required
                placeholder={t('titlePlaceholder')}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="note-body" className="text-sm font-medium">
                  {t('fieldBody')}
                </label>
                <textarea
                  id="note-body"
                  value={editing.body}
                  maxLength={4000}
                  rows={6}
                  placeholder={t('bodyPlaceholder')}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  className="min-h-32 rounded-md border border-border-strong bg-surface px-3 py-2.5 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                />
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem]">
                <input
                  type="checkbox"
                  checked={editing.pinned}
                  onChange={(e) => setEditing({ ...editing, pinned: e.target.checked })}
                  className="size-5 accent-(--color-accent)"
                />
                <Pin aria-hidden className="size-4 text-text-muted" />
                {t('fieldPinned')}
              </label>
              <div className="flex flex-wrap justify-between gap-2">
                {editing.note ? (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => remove(editing.note!)}
                    loading={actions.remove.isPending}
                  >
                    {t('delete')}
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="submit"
                  disabled={!editing.title.trim() || !online}
                  loading={actions.create.isPending || actions.update.isPending}
                >
                  {t(editing.note ? 'save' : 'add')}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function NoteCard({
  note: n,
  disabled,
  onEdit,
  onPin,
  onCopy,
}: {
  note: NoteDto;
  disabled: boolean;
  onEdit: () => void;
  onPin: () => void;
  onCopy: () => void;
}) {
  const t = useTranslations('notes');
  const format = useFormatter();
  const { household } = useSession();
  const by = household.members.find((m) => m.id === n.updatedById)?.displayName;
  const icon =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-50';
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-1">
        <h2 className="min-w-0 flex-1 break-words pt-2.5 font-medium">
          {n.pinned && <span className="sr-only">{t('pinned')} · </span>}
          {n.title}
        </h2>
        <button
          type="button"
          className={cn(icon, n.pinned && 'text-accent')}
          aria-label={t(n.pinned ? 'unpin' : 'pin', { title: n.title })}
          aria-pressed={n.pinned}
          disabled={disabled}
          onClick={onPin}
        >
          <Pin aria-hidden className={cn('size-4', n.pinned && 'fill-current')} />
        </button>
        <button
          type="button"
          className={icon}
          aria-label={t('copy', { title: n.title })}
          onClick={onCopy}
        >
          <Copy aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          className={icon}
          aria-label={t('editOne', { title: n.title })}
          disabled={disabled}
          onClick={onEdit}
        >
          <Pencil aria-hidden className="size-4" />
        </button>
      </div>
      {n.body && (
        <p className="whitespace-pre-wrap break-words text-[0.9375rem] text-text">{n.body}</p>
      )}
      <p className="text-[0.8125rem] text-text-muted">
        {t('updated', {
          date: format.dateTime(new Date(n.updatedAt), { day: 'numeric', month: 'short' }),
          name: by ?? t('someone'),
        })}
      </p>
    </li>
  );
}
