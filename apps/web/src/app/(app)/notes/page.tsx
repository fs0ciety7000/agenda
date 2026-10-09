'use client';

import type { NoteDto } from '@agenda/contracts';
import { ChevronDown, Copy, History, Lock, Pencil, Pin, Plus, StickyNote } from 'lucide-react';
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
import { useNoteActions, useNoteRevisions, useNotes } from '@/lib/notes';

type Editing = {
  note: NoteDto | null;
  title: string;
  body: string;
  pinned: boolean;
  secret: boolean;
  /** Note sensible pas encore affichée : son contenu n'est pas modifiable (ni envoyé). */
  bodyLocked: boolean;
};

/** Demande de mot de passe (ou de confirmation) pour ouvrir le coffre. */
type VaultPrompt = { method: 'password' | 'confirm'; note: NoteDto; then: (body: string) => void };

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
  // Contenus des notes sensibles affichés pendant cette visite de la page (jamais conservés).
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState<VaultPrompt | null>(null);

  const fail = (e: unknown) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' });
  const edit = (note: NoteDto, body?: string): Editing => ({
    note,
    title: note.title,
    body: body ?? note.body,
    pinned: note.pinned,
    secret: note.secret,
    bodyLocked: note.secret && body === undefined,
  });
  const open = (note: NoteDto | null) => {
    setConflict(false);
    setEditing(
      note
        ? edit(note, note.secret ? revealed[note.id] : undefined)
        : { note: null, title: '', body: '', pinned: false, secret: false, bodyLocked: false },
    );
  };
  /** Contenu de la note, après le mot de passe si le coffre est fermé. */
  const reveal = (note: NoteDto, then: (body: string) => void) => {
    if (!note.secret) return then(note.body);
    const known = revealed[note.id];
    if (known !== undefined) return then(known);
    actions.reveal.mutate(
      { id: note.id },
      {
        onSuccess: ({ body }) => {
          setRevealed((m) => ({ ...m, [note.id]: body }));
          then(body);
        },
        onError: (err) => {
          const method =
            err instanceof ApiError && err.code === 'VAULT_LOCKED'
              ? (err.details as { method?: string } | undefined)?.method
              : undefined;
          if (method === 'password' || method === 'confirm') setPrompt({ method, note, then });
          else fail(err);
        },
      },
    );
  };
  const hide = (note: NoteDto) => setRevealed(({ [note.id]: _, ...rest }) => rest);
  const togglePin = (n: NoteDto) =>
    actions.update.mutate({ id: n.id, pinned: !n.pinned, version: n.version }, { onError: fail });
  const copy = (n: NoteDto) =>
    reveal(n, async (body) => {
      try {
        await navigator.clipboard.writeText(body || n.title);
        toast({ message: t('copied', { title: n.title }) });
      } catch {
        toast({ message: t('copyFailed'), tone: 'error' });
      }
    });

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const { note, title, body, pinned, secret, bodyLocked } = editing;
    const done = () => {
      setEditing(null);
      toast({ message: t(note ? 'saved' : 'created') });
    };
    if (!note) {
      actions.create.mutate({ title, body, pinned, secret }, { onSuccess: done, onError: fail });
      return;
    }
    actions.update.mutate(
      // Contenu verrouillé : il n'est pas envoyé (sinon il serait effacé).
      {
        id: note.id,
        title,
        body: bodyLocked ? undefined : body,
        pinned,
        secret,
        version: note.version,
      },
      {
        onSuccess: (saved) => {
          if (saved.secret && !bodyLocked) setRevealed((m) => ({ ...m, [saved.id]: body }));
          done();
        },
        onError: (err) => {
          // Modifiée par l'autre entre-temps : sa version s'affiche, on peut réenregistrer.
          const current = (err instanceof ApiError &&
            err.code === 'VERSION_CONFLICT' &&
            (err.details as { current?: NoteDto } | undefined)?.current) as NoteDto | undefined;
          if (current) {
            setConflict(true);
            setEditing(edit(current));
          } else fail(err);
        },
      },
    );
  };
  // Une note sensible est d'abord affichée (mot de passe) : « Annuler » la recrée à l'identique.
  const remove = (note: NoteDto) =>
    reveal(note, (body) =>
      actions.remove.mutate(note.id, {
        onSuccess: () => {
          setEditing(null);
          hide(note);
          toast({
            message: t('deleted', { title: note.title }),
            action: {
              label: t('undo'),
              onClick: () =>
                actions.create.mutate(
                  { title: note.title, body, pinned: note.pinned, secret: note.secret },
                  { onError: fail },
                ),
            },
          });
        },
        onError: fail,
      }),
    );

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
            illustration="notes"
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
              revealedBody={revealed[n.id]}
              onEdit={() => open(n)}
              onPin={() => togglePin(n)}
              onCopy={() => copy(n)}
              onReveal={() => reveal(n, () => undefined)}
              onHide={() => hide(n)}
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
              {editing.bodyLocked && editing.note ? (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-3">
                  <p className="flex items-center gap-2 text-[0.9375rem] text-text-muted">
                    <Lock aria-hidden className="size-4" />
                    {t('secretLocked')}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    disabled={!online}
                    loading={actions.reveal.isPending}
                    onClick={() =>
                      reveal(editing.note!, (body) =>
                        setEditing((e) => (e ? { ...e, body, bodyLocked: false } : e)),
                      )
                    }
                  >
                    {t('revealToEdit')}
                  </Button>
                </div>
              ) : (
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
              )}
              {editing.note && (
                <NoteHistory
                  key={editing.note.version}
                  note={editing.note}
                  online={online}
                  onRestored={(restored) => {
                    setConflict(false);
                    hide(restored);
                    setEditing(edit(restored));
                  }}
                  onConflict={(current) => {
                    setConflict(true);
                    setEditing(edit(current));
                  }}
                  onError={fail}
                />
              )}
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
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[0.9375rem]">
                <input
                  type="checkbox"
                  checked={editing.secret}
                  disabled={editing.bodyLocked}
                  onChange={(e) => setEditing({ ...editing, secret: e.target.checked })}
                  className="mt-0.5 size-5 accent-(--color-accent)"
                />
                <Lock aria-hidden className="mt-0.5 size-4 text-text-muted" />
                <span className="flex flex-col gap-0.5">
                  {t('fieldSecret')}
                  <span className="text-[0.8125rem] text-text-muted">{t('secretHint')}</span>
                </span>
              </label>
              <div className="flex flex-wrap justify-between gap-2">
                {editing.note ? (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => remove(editing.note!)}
                    loading={actions.remove.isPending || actions.reveal.isPending}
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

      {prompt && (
        <VaultDialog
          prompt={prompt}
          onClose={() => setPrompt(null)}
          onRevealed={(body) => {
            setRevealed((m) => ({ ...m, [prompt.note.id]: body }));
            setPrompt(null);
            prompt.then(body);
          }}
        />
      )}
    </div>
  );
}

/** Ouvrir le coffre : mot de passe du compte, ou confirmation pour un compte sans mot de passe. */
function VaultDialog({
  prompt,
  onClose,
  onRevealed,
}: {
  prompt: VaultPrompt;
  onClose: () => void;
  onRevealed: (body: string) => void;
}) {
  const t = useTranslations('notes');
  const te = useTranslations('errors');
  const { household } = useSession();
  const actions = useNoteActions(household.id);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    actions.reveal.mutate(
      prompt.method === 'password'
        ? { id: prompt.note.id, password }
        : { id: prompt.note.id, confirm: true },
      {
        onSuccess: ({ body }) => onRevealed(body),
        onError: (err) => setError(te(errorKey(err) as 'generic')),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t('revealTitle')}
        description={t(prompt.method === 'password' ? 'revealBody' : 'revealConfirmBody', {
          title: prompt.note.title,
        })}
        closeLabel={t('close')}
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {prompt.method === 'password' && (
            <Field
              label={t('revealPassword')}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error ?? undefined}
            />
          )}
          {prompt.method === 'confirm' && error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={prompt.method === 'password' && !password}
              loading={actions.reveal.isPending}
            >
              {t('revealSubmit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NoteCard({
  note: n,
  disabled,
  revealedBody,
  onEdit,
  onPin,
  onCopy,
  onReveal,
  onHide,
}: {
  note: NoteDto;
  disabled: boolean;
  /** Contenu d'une note sensible, une fois affiché. */
  revealedBody?: string;
  onEdit: () => void;
  onPin: () => void;
  onCopy: () => void;
  onReveal: () => void;
  onHide: () => void;
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
      {n.secret ? (
        <div className="flex flex-wrap items-center gap-2">
          {revealedBody !== undefined ? (
            <p className="w-full whitespace-pre-wrap break-words text-[0.9375rem] text-text">
              {revealedBody}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-[0.9375rem] text-text-muted">
              <Lock aria-hidden className="size-4" />
              {t('secretLocked')}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={revealedBody === undefined && disabled}
            aria-label={t(revealedBody !== undefined ? 'hideOne' : 'revealOne', { title: n.title })}
            onClick={revealedBody !== undefined ? onHide : onReveal}
          >
            {t(revealedBody !== undefined ? 'hide' : 'reveal')}
          </Button>
        </div>
      ) : (
        n.body && (
          <p className="whitespace-pre-wrap break-words text-[0.9375rem] text-text">{n.body}</p>
        )
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

/** Versions précédentes d'une note (repliées) : revoir et restaurer celle d'avant. */
function NoteHistory({
  note,
  online,
  onRestored,
  onConflict,
  onError,
}: {
  note: NoteDto;
  online: boolean;
  onRestored: (note: NoteDto) => void;
  onConflict: (current: NoteDto) => void;
  onError: (e: unknown) => void;
}) {
  const t = useTranslations('notes');
  const format = useFormatter();
  const toast = useToast();
  const { household } = useSession();
  const [open, setOpen] = useState(false);
  const revisions = useNoteRevisions(household.id, note.id, open);
  const actions = useNoteActions(household.id);
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const restore = (revisionId: string, savedAt: string) =>
    actions.restore.mutate(
      { id: note.id, revisionId, version: note.version },
      {
        onSuccess: (restored) => {
          toast({ message: t('restored', { date: when(savedAt) }) });
          onRestored(restored);
        },
        onError: (err) => {
          const current = (err instanceof ApiError &&
            err.code === 'VERSION_CONFLICT' &&
            (err.details as { current?: NoteDto } | undefined)?.current) as NoteDto | undefined;
          if (current) onConflict(current);
          else onError(err);
        },
      },
    );
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="note-history"
        onClick={() => setOpen(!open)}
        className="-mx-2 inline-flex min-h-11 items-center gap-2 self-start rounded-md px-2 text-[0.9375rem] text-text-muted hover:bg-surface-muted hover:text-text"
      >
        <History aria-hidden className="size-4" />
        {t('history')}
        <ChevronDown
          aria-hidden
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div id="note-history">
          {revisions.isPending ? (
            <Skeleton className="h-16" />
          ) : revisions.isError ? (
            <p className="text-sm text-text-muted">{t('historyError')}</p>
          ) : revisions.data.length === 0 ? (
            <p className="text-sm text-text-muted">{t('historyEmpty')}</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto" aria-label={t('history')}>
              {revisions.data.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-muted p-3"
                >
                  <p className="text-[0.8125rem] text-text-muted">
                    {t('historyBy', {
                      date: when(r.savedAt),
                      name:
                        household.members.find((m) => m.id === r.editedById)?.displayName ??
                        t('someone'),
                    })}
                  </p>
                  {r.title !== note.title && <p className="break-words font-medium">{r.title}</p>}
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-[0.9375rem]">
                    {note.secret ? t('secretLocked') : r.body || t('historyNoText')}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    disabled={!online}
                    loading={
                      actions.restore.isPending && actions.restore.variables?.revisionId === r.id
                    }
                    onClick={() => restore(r.id, r.savedAt)}
                  >
                    {t('restore')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
