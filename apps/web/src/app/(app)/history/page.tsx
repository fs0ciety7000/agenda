'use client';

import type { ActivityDto, TrashItemDto } from '@agenda/contracts';
import { Download, RotateCcw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSession } from '@/components/app/household-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  downloadFile,
  fetchAllActivity,
  toCsv,
  useActivity,
  useRestore,
  useTrash,
} from '@/lib/activity';

/** Journal d'activité (exportable) et corbeille (30 jours). */
export default function HistoryPage() {
  const t = useTranslations('activity');
  const [tab, setTab] = useState<'log' | 'trash'>('log');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <Segmented
          label={t('title')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'log', label: t('tabLog') },
            { value: 'trash', label: t('tabTrash') },
          ]}
        />
      </div>
      {tab === 'log' ? <ActivityLog /> : <Trash />}
    </div>
  );
}

/** Nom de l'auteur d'une action (Google Calendar si aucun, « ancien membre » s'il est parti). */
function useWho() {
  const t = useTranslations('activity');
  const { household } = useSession();
  const names = new Map(household.members.map((m) => [m.id, m.displayName]));
  return (actorId: string | null) =>
    actorId === null ? t('system') : (names.get(actorId) ?? t('formerMember'));
}

function useDescribe() {
  const t = useTranslations('activity');
  const format = useFormatter();
  const who = useWho();
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00`), { day: 'numeric', month: 'long', year: 'numeric' });
  const actionKey = (a: string) => a.replace(/\./g, '_');
  return {
    who,
    day,
    action: (a: ActivityDto) =>
      t.has(`actions.${actionKey(a.action)}` as 'actions.other')
        ? t(`actions.${actionKey(a.action)}` as 'actions.other')
        : t('actions.other'),
    fields: (a: ActivityDto) =>
      a.fields
        .map((f) =>
          t.has(`fields.${f}` as 'fields.title') ? t(`fields.${f}` as 'fields.title') : f,
        )
        .join(', '),
  };
}

function ActivityLog() {
  const t = useTranslations('activity');
  const format = useFormatter();
  const toast = useToast();
  const { household } = useSession();
  const activity = useActivity(household.id);
  const d = useDescribe();
  const [exporting, setExporting] = useState(false);
  const items = activity.data?.pages.flatMap((p) => p.items) ?? [];

  const onExport = async () => {
    setExporting(true);
    try {
      const all = await fetchAllActivity(household.id);
      const rows = all.map((a) => {
        const at = new Date(a.at);
        return [
          format.dateTime(at, { year: 'numeric', month: '2-digit', day: '2-digit' }),
          format.dateTime(at, { hour: '2-digit', minute: '2-digit' }),
          d.who(a.actorId),
          d.action(a),
          a.title ?? '',
          a.date ?? '',
          d.fields(a),
        ];
      });
      const header = ['date', 'time', 'who', 'action', 'task', 'taskDate', 'fields'].map((k) =>
        t(`csv.${k}` as 'csv.date'),
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(`agenda-journal-${stamp}.csv`, toCsv([header, ...rows]));
    } catch {
      toast({ message: t('exportError'), tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // Regroupement par jour (heure locale du navigateur).
  const groups: { day: string; items: ActivityDto[] }[] = [];
  for (const a of items) {
    const day = format.dateTime(new Date(a.at), { weekday: 'long', day: 'numeric', month: 'long' });
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(a);
    else groups.push({ day, items: [a] });
  }

  return (
    <section className="flex flex-col gap-4" aria-label={t('tabLog')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.9375rem] text-text-muted">{t('intro')}</p>
        <Button variant="secondary" onClick={onExport} loading={exporting} disabled={!items.length}>
          <Download aria-hidden className="size-4" />
          {t('export')}
        </Button>
      </div>
      {activity.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : !items.length ? (
        <Card>
          <p className="text-[0.9375rem] text-text-muted">{t('empty')}</p>
        </Card>
      ) : (
        groups.map((g) => (
          <div key={g.day} className="flex flex-col gap-2">
            <h2 className="text-[0.8125rem] font-medium text-text-muted first-letter:uppercase">
              {g.day}
            </h2>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {g.items.map((a) => (
                  <li key={a.id} className="flex gap-3 px-4 py-3 text-[0.9375rem]">
                    <time dateTime={a.at} className="w-12 shrink-0 tabular-nums text-text-muted">
                      {format.dateTime(new Date(a.at), { hour: '2-digit', minute: '2-digit' })}
                    </time>
                    <div className="min-w-0">
                      <p>
                        <span className="font-medium">{d.who(a.actorId)}</span> {d.action(a)} «{' '}
                        {a.title || t('untitled')} »
                      </p>
                      {(a.date || a.fields.length > 0) && (
                        <p className="text-[0.8125rem] text-text-muted">
                          {[
                            a.date ? t('forDate', { date: d.day(a.date) }) : null,
                            a.fields.length ? t('changed', { fields: d.fields(a) }) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ))
      )}
      {activity.hasNextPage && (
        <Button
          variant="secondary"
          className="self-center"
          onClick={() => void activity.fetchNextPage()}
          loading={activity.isFetchingNextPage}
        >
          {t('loadMore')}
        </Button>
      )}
    </section>
  );
}

function Trash() {
  const t = useTranslations('activity');
  const format = useFormatter();
  const toast = useToast();
  const { household } = useSession();
  const trash = useTrash(household.id);
  const restore = useRestore(household.id);
  const who = useWho();
  const { day } = useDescribe();

  const onRestore = (item: TrashItemDto) =>
    restore.mutate(
      { trashId: item.id },
      {
        onSuccess: () => toast({ message: t('restored', { title: item.title }) }),
        onError: () => toast({ message: t('restoreError'), tone: 'error' }),
      },
    );

  return (
    <section className="flex flex-col gap-4" aria-label={t('tabTrash')}>
      <p className="text-[0.9375rem] text-text-muted">{t('trashIntro')}</p>
      {trash.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !trash.data?.length ? (
        <Card>
          <p className="text-[0.9375rem] text-text-muted">{t('trashEmpty')}</p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {trash.data.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-medium">
                    {item.title || t('untitled')}
                  </p>
                  <p className="text-[0.8125rem] text-text-muted">
                    {[
                      t(`kind_${item.kind}`),
                      item.date ? day(item.date) : null,
                      t('deletedBy', {
                        who: who(item.deletedById),
                        when: format.relativeTime(new Date(item.deletedAt)),
                      }),
                      t('purgeOn', {
                        date: format.dateTime(new Date(item.purgeAt), {
                          day: 'numeric',
                          month: 'long',
                        }),
                      }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  aria-label={t('restoreLabel', { title: item.title })}
                  onClick={() => onRestore(item)}
                  loading={
                    restore.isPending &&
                    !!restore.variables &&
                    'trashId' in restore.variables &&
                    restore.variables.trashId === item.id
                  }
                >
                  <RotateCcw aria-hidden className="size-4" />
                  {t('restore')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
