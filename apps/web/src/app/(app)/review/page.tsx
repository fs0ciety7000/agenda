'use client';

import type { WeeklyReviewDto } from '@agenda/contracts';
import { addDays, startOfWeek } from '@agenda/domain';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSession } from '@/components/app/household-context';
import { MemberAvatar } from '@/components/app/member-avatar';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { api } from '@/lib/api';
import { formatDuration, useToday } from '@/lib/format';

/** Revue du dimanche : ce qui a été fait, ce qui a glissé, la semaine qui vient. */
export default function ReviewPage() {
  const t = useTranslations('review');
  const tc = useTranslations('errors');
  const format = useFormatter();
  const { household } = useSession();
  const today = useToday();
  const [monday, setMonday] = useState(() => startOfWeek(today));
  const review = useQuery({
    queryKey: ['households', household.id, 'review', monday],
    queryFn: () => api<WeeklyReviewDto>(`/v1/households/${household.id}/review?date=${monday}`),
  });
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' });
  const isCurrent = monday === startOfWeek(today);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-[0.9375rem] text-text-muted">
            {t('subtitle', { from: day(monday), to: day(addDays(monday, 6)) })}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('prev')}
            onClick={() => setMonday(addDays(monday, -7))}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('next')}
            disabled={isCurrent}
            onClick={() => setMonday(addDays(monday, 7))}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      {review.error ? (
        <ErrorState
          message={t('error')}
          retryLabel={tc('retry')}
          onRetry={() => void review.refetch()}
        />
      ) : !review.data ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <ReviewContent data={review.data} showNext={isCurrent} />
      )}
      <Link
        href="/stats"
        className="self-start text-sm text-accent underline-offset-4 hover:underline"
      >
        {t('openStats')}
      </Link>
    </div>
  );
}

function ReviewContent({ data, showNext }: { data: WeeklyReviewDto; showNext: boolean }) {
  const t = useTranslations('review');
  const format = useFormatter();
  const { household } = useSession();
  const members = new Map(household.members.map((m) => [m.id, m]));
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00`), { weekday: 'short', day: 'numeric' });

  return (
    <>
      <section aria-labelledby="rv-done" className="flex flex-col gap-3">
        <SectionTitle id="rv-done">{t('done', { count: data.done })}</SectionTitle>
        <Card className="flex flex-col gap-3">
          {data.byMember.map((m) => {
            const member = members.get(m.memberId);
            if (!member) return null;
            return (
              <div key={m.memberId} className="flex items-center gap-3">
                <MemberAvatar member={member} />
                <span className="flex-1 font-medium">{member.displayName}</span>
                <span className="text-[0.9375rem] tabular-nums text-text-muted">
                  {t('doneBy', { count: m.done })}
                </span>
                {m.thanks > 0 && (
                  <span className="inline-flex items-center gap-1 text-[0.9375rem] tabular-nums text-accent">
                    <Heart aria-hidden className="size-4 fill-current" />
                    {m.thanks}
                  </span>
                )}
              </div>
            );
          })}
          {data.doneMinutes > 0 && (
            <p className="text-[0.8125rem] text-text-muted">
              {t('minutes', { time: formatDuration(data.doneMinutes) })}
            </p>
          )}
        </Card>
      </section>

      <section aria-labelledby="rv-missed" className="flex flex-col gap-3">
        <SectionTitle id="rv-missed">{t('missedTitle')}</SectionTitle>
        <Card className="flex flex-col gap-2">
          {data.missed.length === 0 ? (
            <p className="text-[0.9375rem] text-text-muted">{t('missedNone')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.missed.map((o) => (
                <li key={o.id} className="flex items-baseline justify-between gap-3">
                  <Link href={`/?open=${o.id}`} className="truncate hover:underline">
                    {o.title}
                  </Link>
                  <span className="shrink-0 text-[0.8125rem] text-text-muted">{day(o.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {showNext && (
        <section aria-labelledby="rv-next" className="flex flex-col gap-3">
          <SectionTitle id="rv-next">{t('nextTitle')}</SectionTitle>
          <Card className="flex flex-col gap-2">
            <p className="font-medium">{t('nextTotal', { count: data.next.total })}</p>
            {data.next.total > 0 && (
              <p className="text-[0.9375rem] text-text-muted">
                {t('nextBalanced')}
                {data.next.byMember
                  .map((m) => `${members.get(m.memberId)?.displayName ?? '?'} ${m.count}`)
                  .join(' · ')}
                {data.next.unassigned > 0 &&
                  ` · ${t('nextUnassigned', { count: data.next.unassigned })}`}
              </p>
            )}
            <Link
              href="/calendar"
              className="self-start text-sm text-accent underline-offset-4 hover:underline"
            >
              {t('plan')}
            </Link>
          </Card>
        </section>
      )}
    </>
  );
}
