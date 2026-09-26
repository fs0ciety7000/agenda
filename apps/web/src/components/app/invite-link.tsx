'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, errorKey } from '@/lib/api';

export function InviteLink({ householdId }: { householdId: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const invite = useMutation({
    mutationFn: () =>
      api<{ token: string }>(`/v1/households/${householdId}/invitations`, {
        method: 'POST',
        json: {},
      }),
  });
  const url = invite.data ? `${window.location.origin}/invite/${invite.data.token}` : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.9375rem] text-text-muted">{t('onboarding.inviteBody')}</p>
      {url ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={url}
            aria-label={t('onboarding.stepInvite')}
            className="h-11 flex-1 truncate rounded-md border border-border bg-surface-muted px-3 text-sm"
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
            <span aria-live="polite">{copied ? t('onboarding.copied') : t('onboarding.copy')}</span>
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          loading={invite.isPending}
          onClick={() => invite.mutate()}
          className="self-start"
        >
          <Link2 aria-hidden className="size-4" />
          {t('onboarding.generateInvite')}
        </Button>
      )}
      {invite.error && (
        <p role="alert" className="text-sm text-danger">
          {t(`errors.${errorKey(invite.error)}` as 'errors.generic')}
        </p>
      )}
    </div>
  );
}
