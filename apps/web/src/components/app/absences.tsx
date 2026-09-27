'use client';

import { Plane, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useAbsenceMutations, useAbsences } from '@/lib/absences';
import { addDays, useToday } from '@/lib/format';
import { useSession } from './household-context';

/** « 4 octobre » (date locale du foyer, telle que stockée). */
export function useShortDate() {
  const format = useFormatter();
  return (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
    });
}

/** Réglages → Absences : pendant une absence, les tâches partagées passent à l'autre. */
export function AbsencesSettings() {
  const t = useTranslations('absences');
  const { household, me } = useSession();
  const today = useToday();
  const toast = useToast();
  const shortDate = useShortDate();
  const absences = useAbsences(household.id);
  const { create, remove } = useAbsenceMutations(household.id);
  const myId = household.members.find((m) => m.userId === me.id)?.id ?? '';
  const [memberId, setMemberId] = useState(myId);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 6));
  const name = (id: string) =>
    household.members.find((m) => m.id === id)?.displayName ?? t('formerMember');
  const valid = Boolean(memberId && start && end && start <= end && end >= today);

  if (household.members.length < 2) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="s-absences">
      <SectionTitle id="s-absences">{t('title')}</SectionTitle>
      <Card className="flex flex-col gap-4">
        <p className="text-[0.9375rem] text-text-muted">{t('intro')}</p>

        {(absences.data?.length ?? 0) > 0 && (
          <ul aria-label={t('list')} className="flex flex-col divide-y divide-border">
            {absences.data!.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <Plane aria-hidden className="size-4 shrink-0 text-text-muted" />
                <span className="flex-1 text-[0.9375rem]">
                  {t('item', {
                    name: name(a.memberId),
                    from: shortDate(a.startDate),
                    to: shortDate(a.endDate),
                  })}
                </span>
                <button
                  type="button"
                  aria-label={t('remove', { name: name(a.memberId) })}
                  onClick={() =>
                    remove.mutate(a.id, {
                      onSuccess: () => toast({ message: t('removed') }),
                      onError: () => toast({ message: t('error'), tone: 'error' }),
                    })
                  }
                  className="inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            create.mutate(
              { memberId, startDate: start, endDate: end },
              {
                onSuccess: () => toast({ message: t('added', { name: name(memberId) }) }),
                onError: () => toast({ message: t('error'), tone: 'error' }),
              },
            );
          }}
        >
          <Select label={t('who')} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {household.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </Select>
          <Field
            label={t('from')}
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value > end) setEnd(e.target.value);
            }}
          />
          <Field
            label={t('to')}
            type="date"
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <Button type="submit" disabled={!valid || create.isPending}>
            {t('add')}
          </Button>
        </form>
      </Card>
    </section>
  );
}

/** Aujourd'hui : « Grace est absente jusqu'au 4 octobre ». */
export function AbsenceBanner() {
  const t = useTranslations('absences');
  const { household } = useSession();
  const shortDate = useShortDate();
  const away = household.members.filter((m) => m.absentUntil);
  if (!away.length) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-[0.9375rem]"
    >
      <Plane aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
      <p>
        {away
          .map((m) => t('banner', { name: m.displayName, until: shortDate(m.absentUntil!) }))
          .join(' ')}
      </p>
    </div>
  );
}
