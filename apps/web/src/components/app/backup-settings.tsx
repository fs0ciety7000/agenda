'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiError, errorKey } from '@/lib/api';
import { useBackup } from '@/lib/backup';

/**
 * Sauvegarde du foyer : une archive .zip de tout le foyer, à garder ou à restaurer ailleurs. Elle
 * contient le texte des notes sensibles : mot de passe (ou confirmation) demandé comme pour elles.
 */
export function BackupSettings({ householdId }: { householdId: string }) {
  const t = useTranslations('backup');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const toast = useToast();
  const { download } = useBackup(householdId);
  const [method, setMethod] = useState<'password' | 'confirm' | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = (input: { password?: string; confirm?: boolean }) => {
    setError(null);
    download.mutate(input, {
      onSuccess: () => {
        setMethod(null);
        setPassword('');
        toast({ message: t('done') });
      },
      onError: (err) => {
        // Coffre fermé : on demande le mot de passe (ou la confirmation), puis on réessaie.
        if (err instanceof ApiError && err.code === 'VAULT_LOCKED') {
          const m = (err.details as { method?: string } | undefined)?.method;
          setMethod(m === 'confirm' ? 'confirm' : 'password');
          return;
        }
        const message = te(errorKey(err) as 'generic');
        if (method) setError(message);
        else toast({ message, tone: 'error' });
      },
    });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(method === 'password' ? { password } : { confirm: true });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.9375rem] text-text-muted">{t('intro')}</p>
      <p className="text-[0.8125rem] text-text-muted">{t('excluded')}</p>
      <Button
        variant="secondary"
        className="self-start"
        loading={download.isPending && !method}
        onClick={() => run({})}
      >
        <Download aria-hidden className="size-4" />
        {download.isPending && !method ? t('preparing') : t('download')}
      </Button>
      <p className="text-[0.8125rem] text-text-muted">{t('private')}</p>

      <Dialog
        open={method !== null}
        onOpenChange={(o) => {
          if (!o) {
            setMethod(null);
            setPassword('');
            setError(null);
          }
        }}
      >
        <DialogContent
          title={t('vaultTitle')}
          description={t(method === 'confirm' ? 'vaultConfirm' : 'vaultPassword')}
          closeLabel={tc('close')}
        >
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {method === 'password' && (
              <Field
                label={t('password')}
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={error ?? undefined}
              />
            )}
            {method === 'confirm' && error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={method === 'password' && !password}
                loading={download.isPending}
              >
                {t('submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
