'use client';

import { Password } from '@agenda/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { api, errorKey } from '@/lib/api';

function ResetForm() {
  const t = useTranslations('auth');
  const te = useTranslations('errors');
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget as HTMLFormElement).get('password') ?? '');
    if (!Password.safeParse(password).success) return setError(te('passwordMin'));
    setBusy(true);
    setError(null);
    try {
      await api<void>('/v1/auth/password/reset', { method: 'POST', json: { token, password } });
      setDone(true);
    } catch (err) {
      setError(te(errorKey(err) as 'generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t('resetTitle')}</h1>
      {done ? (
        <>
          <p className="text-[0.9375rem] text-text-muted">{t('resetDone')}</p>
          <Button asChild size="lg">
            <Link href="/login">{t('toLogin')}</Link>
          </Button>
        </>
      ) : !token ? (
        <p role="alert" className="text-[0.9375rem] text-danger">
          {te('RESET_TOKEN_INVALID')}
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <Field
            label={t('newPassword')}
            type="password"
            autoComplete="new-password"
            hint={t('passwordHint')}
            name="password"
            error={error ?? undefined}
          />
          <Button type="submit" size="lg" loading={busy}>
            {t('resetSubmit')}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
