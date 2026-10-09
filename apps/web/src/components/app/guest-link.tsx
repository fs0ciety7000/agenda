'use client';

import { Check, Copy, Link2, Send } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSession } from '@/components/app/household-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useGuestShoppingLink } from '@/lib/shopping';

/**
 * Lien invité vers la liste de courses (baby-sitter, quelqu'un qui garde la maison) : lecture
 * seule, sans compte, un par foyer. Créer, copier, envoyer, remplacer ou couper.
 */
export function GuestLinkButton() {
  const t = useTranslations('guestLink');
  const tc = useTranslations('common');
  const format = useFormatter();
  const toast = useToast();
  const { household } = useSession();
  const { link, regenerate, revoke } = useGuestShoppingLink(household.id);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const onError = () => toast({ message: t('error'), tone: 'error' });
  const url = link.data?.url ?? null;
  const author = household.members.find((m) => m.id === link.data?.createdById)?.displayName;
  const date = link.data?.createdAt
    ? format.dateTime(new Date(link.data.createdAt), { day: 'numeric', month: 'long' })
    : null;
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        setCopied(false);
      }}
    >
      <Button
        variant="ghost"
        className="self-start"
        // Lien actif : dit aussi en toutes lettres, pas seulement par la pastille.
        aria-label={url ? `${t('share')}, ${t('active')}` : undefined}
        onClick={() => setOpen(true)}
      >
        <Link2 aria-hidden className="size-4" />
        {t('share')}
        {url && <span aria-hidden className="size-2 rounded-full bg-success" />}
      </Button>
      <DialogContent title={t('title')} description={t('intro')} closeLabel={tc('close')}>
        {url ? (
          <div className="flex flex-col gap-3">
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
            {canShare && (
              <Button
                className="self-start"
                onClick={() =>
                  void navigator
                    .share({ title: t('sendText', { household: household.name }), url })
                    .catch(() => undefined)
                }
              >
                <Send aria-hidden className="size-4" />
                {t('send')}
              </Button>
            )}
            {date && (
              <p className="text-[0.8125rem] text-text-muted">
                {author ? t('createdBy', { date, name: author }) : t('createdOn', { date })}
              </p>
            )}
            <p className="text-[0.8125rem] text-text-muted">{t('private')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                loading={regenerate.isPending}
                onClick={() =>
                  window.confirm(t('confirmRegenerate')) &&
                  regenerate.mutate(undefined, { onSuccess: () => setCopied(false), onError })
                }
              >
                {t('regenerate')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={revoke.isPending}
                onClick={() =>
                  window.confirm(t('confirmRevoke')) && revoke.mutate(undefined, { onError })
                }
              >
                {t('revoke')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="self-start"
            loading={regenerate.isPending || link.isPending}
            onClick={() => regenerate.mutate(undefined, { onError })}
          >
            <Link2 aria-hidden className="size-4" />
            {t('create')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
