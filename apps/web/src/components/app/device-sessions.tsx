'use client';

import type { DeviceSessionDto } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Monitor, Smartphone } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api, errorKey } from '@/lib/api';

const sessionsKey = ['me', 'sessions'] as const;

/** Libellé lisible d'un appareil : « App Android · Android 14 », « Chrome · Windows ». */
export function useDeviceLabel() {
  const t = useTranslations('devices');
  return (d: DeviceSessionDto) =>
    d.kind === 'ANDROID_APP'
      ? [t('androidApp'), d.os].filter(Boolean).join(' · ')
      : [d.browser ?? t('unknown'), d.os].filter(Boolean).join(' · ');
}

/**
 * Réglages → Compte : appareils où le compte est connecté, dernière activité, et déconnexion à
 * distance (téléphone perdu, ordinateur partagé).
 */
export function DeviceSessions() {
  const t = useTranslations('devices');
  const te = useTranslations('errors');
  const format = useFormatter();
  const toast = useToast();
  const qc = useQueryClient();
  const label = useDeviceLabel();
  const sessions = useQuery({
    queryKey: sessionsKey,
    queryFn: () => api<DeviceSessionDto[]>('/v1/me/sessions'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api<void>(`/v1/me/sessions/${id}`, { method: 'DELETE' }),
    onSettled: () => void qc.invalidateQueries({ queryKey: sessionsKey }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api<void>('/v1/me/sessions', { method: 'DELETE' }),
    onSettled: () => void qc.invalidateQueries({ queryKey: sessionsKey }),
  });
  const [confirmOthers, setConfirmOthers] = useState(false);

  if (sessions.error) {
    return (
      <ErrorState
        message={te(errorKey(sessions.error) as 'generic')}
        retryLabel={te('retry')}
        onRetry={() => void sessions.refetch()}
      />
    );
  }
  if (!sessions.data) return <Skeleton className="h-24 w-full" />;
  const when = (iso: string) => format.relativeTime(new Date(iso), new Date());
  const others = sessions.data.filter((d) => !d.current).length;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">{t('title')}</h3>
      <p className="text-[0.8125rem] text-text-muted">{t('hint')}</p>
      <ul aria-label={t('title')} className="flex flex-col divide-y divide-border">
        {sessions.data.map((d) => {
          const Icon =
            d.kind === 'ANDROID_APP'
              ? Smartphone
              : d.os === 'Android' || d.os === 'iOS'
                ? Globe
                : Monitor;
          const name = label(d);
          return (
            <li key={d.id} className="flex min-h-14 flex-wrap items-center gap-3 py-2.5">
              <Icon aria-hidden className="size-5 shrink-0 stroke-[1.5] text-text-muted" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="break-words text-[0.9375rem]">
                  {name}
                  {d.current && (
                    <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                      {t('current')}
                    </span>
                  )}
                </span>
                <span className="text-[0.8125rem] text-text-muted">
                  {t('activity', { last: when(d.lastUsedAt), since: when(d.createdAt) })}
                </span>
              </span>
              {!d.current && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('revokeOne', { device: name })}
                  loading={revoke.isPending && revoke.variables === d.id}
                  onClick={() =>
                    revoke.mutate(d.id, {
                      onSuccess: () => toast({ message: t('revoked', { device: name }) }),
                      onError: (e) =>
                        toast({ message: te(errorKey(e) as 'generic'), tone: 'error' }),
                    })
                  }
                >
                  {t('revoke')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others > 1 && (
        <Button variant="secondary" className="self-start" onClick={() => setConfirmOthers(true)}>
          {t('revokeOthers')}
        </Button>
      )}
      <Dialog open={confirmOthers} onOpenChange={setConfirmOthers}>
        <DialogContent
          title={t('revokeOthersTitle', { count: others })}
          description={t('revokeOthersBody')}
          closeLabel={t('cancel')}
        >
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOthers(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              loading={revokeOthers.isPending}
              onClick={() =>
                revokeOthers.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmOthers(false);
                    toast({ message: t('revokedOthers', { count: others }) });
                  },
                  onError: (e) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' }),
                })
              }
            >
              {t('revokeOthers')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
