'use client';

import type { InboundEmailSettingsDto } from '@agenda/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

/** « Ajouter par e-mail » : adresse personnelle ; masqué si le serveur ne l'a pas configuré. */
export function InboundEmailSettings({ householdId }: { householdId: string }) {
  const t = useTranslations('inboundEmail');
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['households', householdId, 'inbound-email'];
  const base = `/v1/households/${householdId}/inbound-email`;
  const settings = useQuery({
    queryKey: key,
    queryFn: () => api<InboundEmailSettingsDto>(base),
  });
  const [copied, setCopied] = useState(false);
  const onError = () => toast({ message: t('error'), tone: 'error' });
  const regenerate = useMutation({
    mutationFn: () => api<InboundEmailSettingsDto>(base, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      setCopied(false);
    },
    onError,
  });
  const disable = useMutation({
    mutationFn: () => api<void>(base, { method: 'DELETE' }),
    onSuccess: () => qc.setQueryData(key, { available: true, address: null }),
    onError,
  });

  if (!settings.data?.available) return null;
  const address = settings.data.address;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="s-inbound">
      <SectionTitle id="s-inbound">{t('title')}</SectionTitle>
      <Card className="flex flex-col gap-3">
        <p className="text-[0.9375rem] text-text-muted">{t('intro')}</p>
        {address ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={address}
                aria-label={t('address')}
                className="h-11 flex-1 truncate rounded-md border border-border bg-surface-muted px-3 text-sm"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(address);
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
            <Mail aria-hidden className="size-4" />
            {t('create')}
          </Button>
        )}
      </Card>
    </section>
  );
}
