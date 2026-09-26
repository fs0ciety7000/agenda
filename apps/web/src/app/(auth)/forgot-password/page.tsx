'use client';

import { ForgotPasswordInput } from '@agenda/contracts';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { api, errorKey } from '@/lib/api';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const te = useTranslations('errors');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const email = new FormData(e.currentTarget as HTMLFormElement).get('email');
    const parsed = ForgotPasswordInput.safeParse({ email });
    if (!parsed.success) return setError(te('email'));
    setBusy(true);
    setError(null);
    try {
      await api<void>('/v1/auth/password/forgot', { method: 'POST', json: parsed.data });
      setSent(true);
    } catch (err) {
      setError(te(errorKey(err) as 'generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('forgotTitle')}</h1>
        <p className="text-[0.9375rem] text-text-muted">
          {sent ? t('forgotSent') : t('forgotSubtitle')}
        </p>
      </div>
      {!sent && (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <Field
            label={t('email')}
            type="email"
            autoComplete="email"
            name="email"
            error={error ?? undefined}
          />
          <Button type="submit" size="lg" loading={busy}>
            {t('forgotSubmit')}
          </Button>
        </form>
      )}
      <Link
        href="/login"
        className="self-center text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        {t('backToLogin')}
      </Link>
    </div>
  );
}
