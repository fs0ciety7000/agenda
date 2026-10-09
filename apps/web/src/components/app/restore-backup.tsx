'use client';

import type { HouseholdDto, RestoreResultDto } from '@agenda/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, errorKey } from '@/lib/api';
import { useBackup } from '@/lib/backup';
import { queryKeys } from '@/lib/queries';

/**
 * Onboarding : recréer son foyer à partir d'une sauvegarde de Tandem (.zip). Les autres membres
 * reçoivent un lien d'invitation : en le suivant avec leur adresse, ils retrouvent leur historique.
 */
export function RestoreBackup({ onRestored }: { onRestored: (r: RestoreResultDto) => void }) {
  const t = useTranslations('backup');
  const te = useTranslations('errors');
  const qc = useQueryClient();
  const { restore } = useBackup();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const error = restore.error
    ? restore.error instanceof ApiError && restore.error.code === 'ALREADY_MEMBER'
      ? t('alreadyInHousehold')
      : te(errorKey(restore.error) as 'generic')
    : null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('restoreTitle')}</h2>
      <p className="text-[0.9375rem] text-text-muted">{t('restoreIntro')}</p>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept=".zip,application/zip"
        aria-label={t('restoreChoose')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          restore.mutate(file, {
            onSuccess: (r) => {
              qc.setQueryData<HouseholdDto[]>(queryKeys.households, [r.household]);
              onRestored(r);
            },
          });
        }}
      />
      <Button
        variant="secondary"
        className="self-start"
        loading={restore.isPending}
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden className="size-4" />
        {restore.isPending ? t('restoring') : t('restoreChoose')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}

/** Après la restauration : un lien à envoyer à chaque autre membre. */
export function RestoredInvitations({ result }: { result: RestoreResultDto }) {
  const t = useTranslations('backup');
  const [copied, setCopied] = useState<string | null>(null);
  if (!result.invitations.length) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.8125rem] text-text-muted">{t('linksValid')}</p>
      {result.invitations.map((inv) => {
        const url = `${window.location.origin}/invite/${inv.token}`;
        return (
          <div key={inv.memberId} className="flex flex-col gap-2">
            <p className="text-[0.9375rem]">
              {t('inviteBody', { name: inv.displayName, email: inv.email })}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={url}
                aria-label={t('inviteLink', { name: inv.displayName })}
                className="h-11 w-full min-w-0 truncate rounded-md border border-border-strong bg-surface-muted px-3 text-sm sm:flex-1"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(inv.memberId);
                }}
              >
                {copied === inv.memberId ? (
                  <Check aria-hidden className="size-4" />
                ) : (
                  <Copy aria-hidden className="size-4" />
                )}
                <span aria-live="polite">{copied === inv.memberId ? t('copied') : t('copy')}</span>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
