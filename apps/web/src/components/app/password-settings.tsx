'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, errorKey } from '@/lib/api';
import { queryKeys } from '@/lib/queries';
import { useSession } from './household-context';

const MIN_LENGTH = 10;

/** Changer (ou définir, pour un compte Google seul) son mot de passe. */
export function PasswordSettings() {
  const t = useTranslations('password');
  const te = useTranslations('errors');
  const { me } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (me.hasPassword && !current) found.current = te('required');
    if (next.length < MIN_LENGTH) found.next = te('passwordMin');
    if (confirm !== next) found.confirm = t('mismatch');
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await api<void>('/v1/auth/password/change', {
        method: 'POST',
        json: me.hasPassword
          ? { currentPassword: current, newPassword: next }
          : { newPassword: next },
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast({ message: t(me.hasPassword ? 'changed' : 'set') });
    } catch (err) {
      const key = errorKey(err);
      if (key === 'CURRENT_PASSWORD_INVALID') setErrors({ current: te(key) });
      else toast({ message: te(key as 'generic'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <p className="text-[0.9375rem]">{t(me.hasPassword ? 'changeTitle' : 'setTitle')}</p>
        <p className="text-[0.8125rem] text-text-muted">
          {t(me.hasPassword ? 'changeHint' : 'setHint')}
        </p>
      </div>
      {me.hasPassword && (
        <Field
          label={t('current')}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
        />
      )}
      <Field
        label={t('new')}
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={errors.next}
        hint={t('rule')}
      />
      <Field
        label={t('confirm')}
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />
      <div>
        <Button type="submit" variant="secondary" loading={busy}>
          {t(me.hasPassword ? 'submitChange' : 'submitSet')}
        </Button>
      </div>
    </form>
  );
}
