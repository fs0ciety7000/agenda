'use client';

import type { IcalFeedDto } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

/** Abonnement iCal personnel (Apple Calendrier, Outlook…) : lien secret, en lecture seule. */
export function IcalFeedSettings({ householdId }: { householdId: string }) {
  const t = useTranslations('icalFeed');
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['households', householdId, 'ical'];
  const base = `/v1/households/${householdId}/ical`;
  const feed = useQuery({ queryKey: key, queryFn: () => api<IcalFeedDto>(base) });
  const [copied, setCopied] = useState(false);
  const onError = () => toast({ message: t('error'), tone: 'error' });
  const regenerate = useMutation({
    mutationFn: () => api<IcalFeedDto>(base, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      setCopied(false);
    },
    onError,
  });
  const disable = useMutation({
    mutationFn: () => api<void>(base, { method: 'DELETE' }),
    onSuccess: () => qc.setQueryData<IcalFeedDto>(key, { url: null }),
    onError,
  });

  if (!feed.data) return null;
  const url = feed.data.url;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="font-medium">{t('title')}</p>
      <p className="text-[0.9375rem] text-text-muted">{t('intro')}</p>
      {url ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={url}
              aria-label={t('address')}
              className="h-11 w-full min-w-0 truncate rounded-md border border-border-strong bg-surface-muted px-3 text-sm sm:flex-1"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
              <span aria-live="polite">{copied ? t('copied') : t('copy')}</span>
            </Button>
          </div>
          <a
            href={url.replace(/^https?:/, 'webcal:')}
            className="self-start text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            {t('openApple')}
          </a>
          <p className="text-[0.8125rem] text-text-muted">{t('howto')}</p>
          <p className="text-[0.8125rem] text-text-muted">{t('private')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              loading={regenerate.isPending}
              onClick={() => window.confirm(t('confirmRegenerate')) && regenerate.mutate()}
            >
              {t('regenerate')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={disable.isPending}
              onClick={() => window.confirm(t('confirmDisable')) && disable.mutate()}
            >
              {t('disable')}
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          loading={regenerate.isPending}
          onClick={() => regenerate.mutate()}
        >
          <CalendarPlus aria-hidden className="size-4" />
          {t('create')}
        </Button>
      )}
    </div>
  );
}
