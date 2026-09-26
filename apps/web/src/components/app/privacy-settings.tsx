'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Download, Link2, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, errorKey } from '@/lib/api';
import { useProviders } from '@/lib/queries';
import { useSession } from './household-context';

/** Liaison Google, export des données (portabilité) et suppression du compte (effacement). */
export function PrivacySettings() {
  const t = useTranslations('privacy');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { me } = useSession();
  const providers = useProviders();
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmWord = t('confirmWord');

  // Retour du flux Google (?linked=google ou ?error=…).
  useEffect(() => {
    if (params.get('linked') === 'google') toast({ message: t('googleLinked') });
    const err = params.get('error');
    if (err === 'GOOGLE_ALREADY_LINKED' || err === 'GOOGLE_FAILED')
      toast({ message: te(err), tone: 'error' });
    if (params.get('linked') || err) router.replace('/settings', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDelete = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<void>('/v1/me', {
        method: 'DELETE',
        json: me.hasPassword
          ? { password }
          : { confirm: confirm.trim().toUpperCase() === confirmWord ? 'SUPPRIMER' : undefined },
      });
      queryClient.clear();
      router.replace('/login');
    } catch (err) {
      setError(te(errorKey(err) as 'generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {providers.data?.google && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.9375rem]">{t('google')}</p>
            <p className="text-[0.8125rem] text-text-muted">
              {me.googleLinked ? t('googleOn') : t('googleOff')}
            </p>
          </div>
          {!me.googleLinked && (
            <Button asChild variant="secondary" size="sm">
              <a href="/v1/auth/google/start?mode=link">
                <Link2 aria-hidden className="size-4" />
                {t('linkGoogle')}
              </a>
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.9375rem]">{t('export')}</p>
          <p className="text-[0.8125rem] text-text-muted">{t('exportHint')}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <a href="/v1/me/export" download>
            <Download aria-hidden className="size-4" />
            {t('exportButton')}
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.9375rem]">{t('delete')}</p>
          <p className="text-[0.8125rem] text-text-muted">{t('deleteHint')}</p>
        </div>
        <Button variant="ghost" size="sm" className="text-danger" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden className="size-4" />
          {t('deleteButton')}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('deleteTitle')} closeLabel={tc('close')}>
          <form onSubmit={onDelete} className="flex flex-col gap-4">
            <ul className="list-disc space-y-1 pl-5 text-[0.9375rem] text-text-muted">
              <li>{t('deleteWhat1')}</li>
              <li>{t('deleteWhat2')}</li>
              <li>{t('deleteWhat3')}</li>
            </ul>
            {me.hasPassword ? (
              <Field
                label={t('password')}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            ) : (
              <Field
                label={t('typeToConfirm', { word: confirmWord })}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="danger" loading={busy}>
                {t('confirmDelete')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
