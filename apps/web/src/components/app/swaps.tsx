'use client';

import type { OccurrenceDto, SwapDto } from '@agenda/contracts';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import { useDayLabel } from '@/lib/format';
import { useSwapActions, useSwaps } from '@/lib/swaps';
import { useSession } from './household-context';

/** Aujourd'hui : demandes d'échange reçues (accepter / refuser) et envoyées (annuler). */
export function SwapBanner() {
  const t = useTranslations('swaps');
  const te = useTranslations('errors');
  const { household } = useSession();
  const swaps = useSwaps(household.id);
  const actions = useSwapActions(household.id);
  const toast = useToast();
  const dayLabel = useDayLabel();
  const name = (id: string) =>
    household.members.find((m) => m.id === id)?.displayName ?? t('someone');
  const onError = (e: unknown) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' });
  const when = (s: SwapDto) => (s.date ? ` · ${dayLabel(s.date)}` : '');
  const incoming = swaps.data?.incoming ?? [];
  const outgoing = swaps.data?.outgoing ?? [];
  if (!incoming.length && !outgoing.length) return null;
  return (
    <section aria-label={t('title')} className="flex flex-col gap-2">
      {incoming.map((s) => (
        <div
          key={s.id}
          className="flex flex-col gap-3 rounded-lg border border-accent bg-surface px-4 py-3"
        >
          <p className="flex items-start gap-2 text-[0.9375rem]">
            <ArrowLeftRight aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              {t('incoming', { name: name(s.fromMemberId), title: s.title })}
              <span className="text-text-muted">{when(s)}</span>
              {s.note && <span className="block text-text-muted">« {s.note} »</span>}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={actions.accept.isPending}
              onClick={() =>
                actions.accept.mutate(s.id, {
                  onSuccess: () => toast({ message: t('accepted', { title: s.title }) }),
                  onError,
                })
              }
            >
              {t('accept')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => actions.decline.mutate(s.id, { onError })}
            >
              {t('decline')}
            </Button>
          </div>
        </div>
      ))}
      {outgoing.map((s) => (
        <div
          key={s.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-[0.9375rem]"
        >
          <span className="flex items-start gap-2">
            <ArrowLeftRight aria-hidden className="mt-0.5 size-4 shrink-0 text-text-muted" />
            <span>
              {t('outgoing', { name: name(s.toMemberId), title: s.title })}
              <span className="text-text-muted">{when(s)}</span>
            </span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.cancel.mutate(s.id, { onError })}
          >
            {t('cancel')}
          </Button>
        </div>
      ))}
    </section>
  );
}

/** Fiche d'une tâche : « Proposer à … » quand je suis responsable d'une tâche partagée à faire. */
export function SwapAsk({ occurrence: o }: { occurrence: OccurrenceDto }) {
  const t = useTranslations('swaps');
  const te = useTranslations('errors');
  const { household, me } = useSession();
  const myId = household.members.find((m) => m.userId === me.id)?.id;
  const swaps = useSwaps(household.id);
  const actions = useSwapActions(household.id);
  const toast = useToast();
  const others = household.members.filter((m) => m.id !== myId && !o.assigneeIds.includes(m.id));
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [note, setNote] = useState('');
  if (!myId || !o.assigneeIds.includes(myId) || o.status !== 'TODO') return null;
  if (o.visibility === 'PERSONAL' || !others.length) return null;
  const pending = swaps.data?.outgoing.find((s) => s.occurrenceId === o.id);
  const name = (id: string) => household.members.find((m) => m.id === id)?.displayName ?? '';

  if (pending) {
    return (
      <p className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm">
        <span>{t('waiting', { name: name(pending.toMemberId) })}</span>
        <Button size="sm" variant="ghost" onClick={() => actions.cancel.mutate(pending.id)}>
          {t('cancel')}
        </Button>
      </p>
    );
  }
  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <ArrowLeftRight aria-hidden className="size-4" />
        {others.length === 1 ? t('askOne', { name: others[0]!.displayName }) : t('ask')}
      </Button>
    );
  }
  const send = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    actions.request.mutate(
      { occurrenceId: o.id, input: { toMemberId: to, note: note.trim() || null } },
      {
        onSuccess: () => {
          setOpen(false);
          toast({ message: t('sent', { name: name(to) }) });
        },
        onError: (err) => toast({ message: te(errorKey(err) as 'generic'), tone: 'error' }),
      },
    );
  };
  // Pas de <form> imbriqué dans le formulaire de la tâche : un groupe avec son propre bouton.
  return (
    <div
      role="group"
      aria-label={t('ask')}
      className="flex flex-col gap-3 rounded-md border border-border p-3"
    >
      {others.length > 1 && (
        <Select label={t('to')} value={to} onChange={(e) => setTo(e.target.value)}>
          {others.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      )}
      <Field
        label={t('note')}
        maxLength={200}
        value={note}
        placeholder={t('notePlaceholder')}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
        <Button type="button" size="sm" loading={actions.request.isPending} onClick={send}>
          {t('send')}
        </Button>
      </div>
    </div>
  );
}
