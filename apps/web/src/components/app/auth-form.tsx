'use client';

import { LoginInput, RegisterInput, type AuthResponse } from '@agenda/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { api, errorKey } from '@/lib/api';

const RegisterForm = RegisterInput.pick({ email: true, password: true, displayName: true });
type FormValues = { email: string; password: string; displayName?: string };

/** Évite les redirections ouvertes : seules les destinations internes sont suivies. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const schema: z.ZodType<FormValues, FormValues> = mode === 'login' ? LoginInput : RegisterForm;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api<AuthResponse>(`/v1/auth/${mode}`, { method: 'POST', json: values });
      queryClient.clear();
      router.replace(safeNext(params.get('next')));
      router.refresh();
    } catch (e) {
      setServerError(t(`errors.${errorKey(e)}` as 'errors.generic'));
    }
  });

  const isLogin = mode === 'login';
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t(isLogin ? 'auth.loginTitle' : 'auth.registerTitle')}
        </h1>
        <p className="text-[0.9375rem] text-text-muted">
          {t(isLogin ? 'auth.loginSubtitle' : 'auth.registerSubtitle')}
        </p>
      </div>

      {!isLogin && (
        <Field
          label={t('auth.displayName')}
          autoComplete="given-name"
          error={errors.displayName && t('errors.required')}
          {...register('displayName')}
        />
      )}
      <Field
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email && t('errors.email')}
        {...register('email')}
      />
      <Field
        label={t('auth.password')}
        type="password"
        autoComplete={isLogin ? 'current-password' : 'new-password'}
        hint={isLogin ? undefined : t('auth.passwordHint')}
        error={errors.password && t(isLogin ? 'errors.required' : 'errors.passwordMin')}
        {...register('password')}
      />

      {serverError && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </p>
      )}

      <Button type="submit" size="lg" loading={isSubmitting}>
        {t(isLogin ? 'auth.submitLogin' : 'auth.submitRegister')}
      </Button>

      <p className="text-center text-sm text-text-muted">
        {t(isLogin ? 'auth.noAccount' : 'auth.hasAccount')}{' '}
        <Link
          href={{
            pathname: isLogin ? '/register' : '/login',
            query: params.get('next') ? { next: params.get('next') } : {},
          }}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {t(isLogin ? 'auth.toRegister' : 'auth.toLogin')}
        </Link>
      </p>
    </form>
  );
}
