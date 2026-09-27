'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useCommentMutations, useComments } from '@/lib/comments';
import { useSession } from './household-context';
import { MemberAvatar } from './member-avatar';

/** Fil de commentaires d'une tâche (« le produit est sous l'évier »), en temps réel. */
export function Comments({ occurrence }: { occurrence: OccurrenceDto }) {
  const t = useTranslations('comments');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const toast = useToast();
  const { household, me } = useSession();
  const comments = useComments(household.id, occurrence.id);
  const { add, remove } = useCommentMutations(household.id, occurrence.id);
  const [draft, setDraft] = useState('');
  const myId = household.members.find((m) => m.userId === me.id)?.id;
  const items = comments.data ?? [];

  const send = () => {
    const body = draft.trim();
    if (!body || add.isPending) return;
    add.mutate(body, {
      onSuccess: () => setDraft(''),
      onError: () => toast({ message: t('error'), tone: 'error' }),
    });
  };

  return (
    <section aria-labelledby="comments-title" className="flex flex-col gap-2">
      <h3 id="comments-title" className="flex items-center gap-2 text-sm font-medium">
        <MessageCircle aria-hidden className="size-4 text-text-muted" />
        {t('title')}
      </h3>
      {items.length > 0 && (
        <ul aria-label={t('title')} className="flex flex-col gap-2">
          {items.map((c) => {
            const author = household.members.find((m) => m.id === c.authorId);
            return (
              <li key={c.id} className="flex items-start gap-2">
                {author ? (
                  <MemberAvatar member={author} size="sm" />
                ) : (
                  <span aria-hidden className="size-6 shrink-0 rounded-full bg-surface-muted" />
                )}
                <div className="min-w-0 flex-1 rounded-lg bg-surface-muted px-3 py-2">
                  <p className="text-[0.8125rem] text-text-muted">
                    <span className="font-medium text-text">
                      {author?.displayName ?? t('formerMember')}
                    </span>{' '}
                    · {format.relativeTime(new Date(c.createdAt), now)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-[0.9375rem]">{c.body}</p>
                </div>
                {c.authorId === myId && (
                  <button
                    type="button"
                    aria-label={t('delete')}
                    onClick={() => {
                      if (window.confirm(t('confirmDelete')))
                        remove.mutate(c.id, {
                          onError: () => toast({ message: t('error'), tone: 'error' }),
                        });
                    }}
                    className="inline-flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="comment-draft" className="sr-only">
          {t('placeholder')}
        </label>
        <textarea
          id="comment-draft"
          rows={1}
          maxLength={2000}
          value={draft}
          placeholder={t('placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
          className="min-h-11 flex-1 resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <Button
          type="button"
          variant="secondary"
          aria-label={t('send')}
          disabled={!draft.trim() || add.isPending}
          onClick={send}
        >
          <Send aria-hidden className="size-4" />
        </Button>
      </div>
    </section>
  );
}
