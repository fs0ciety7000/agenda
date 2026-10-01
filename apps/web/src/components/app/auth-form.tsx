'use client';

import {
  LoginInput,
  RegisterInput,
  type AuthResponse,
  type PasskeyOptionsDto,
} from '@agenda/contracts';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Fingerprint } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { api, errorKey } from '@/lib/api';
import { useProviders } from '@/lib/queries';
import { clearOfflineData } from '@/lib/offline';

const RegisterForm = RegisterInput.pick({ email: true, password: true, displayName: true });
type FormValues = { email: string; password: string; displayName?: string };

/** Évite les redirections ouvertes : seules les destinations internes sont suivies. */
const KNOWN_REDIRECT_ERRORS = [
  'GOOGLE_FAILED',
  'GOOGLE_EMAIL_EXISTS',
  'GOOGLE_NOT_CONFIGURED',
  'REGISTRATION_CLOSED',
];

/** Logo Google officiel (couleurs de la marque, exigées par les consignes Google Sign-In). */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const providers = useProviders();
  // Erreur renvoyée par le retour Google (/login?error=…).
  const redirectError = params.get('error');
  const [serverError, setServerError] = useState<string | null>(
    redirectError && KNOWN_REDIRECT_ERRORS.includes(redirectError)
      ? t(`errors.${redirectError}` as 'errors.generic')
      : null,
  );

  const schema: z.ZodType<FormValues, FormValues> = mode === 'login' ? LoginInput : RegisterForm;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api<AuthResponse>(`/v1/auth/${mode}`, {
        method: 'POST',
        // Nouveau compte : e-mails dans la langue affichée.
        json: mode === 'register' ? { ...values, locale } : values,
      });
      queryClient.clear();
      await clearOfflineData();
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

      {isLogin && providers.data?.passwordReset !== false && (
        <Link
          href="/forgot-password"
          className="-mt-2 self-center text-sm text-text-muted underline-offset-4 hover:text-text hover:underline"
        >
          {t('auth.forgot')}
        </Link>
      )}

      {isLogin && <PasskeyLoginButton next={safeNext(params.get('next'))} />}

      {providers.data?.google && (
        <>
          <div className="flex items-center gap-3 text-xs text-text-muted" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button asChild variant="secondary" size="lg">
            <a
              href={`/v1/auth/google/start?next=${encodeURIComponent(safeNext(params.get('next')))}`}
            >
              <GoogleMark />
              {t('auth.google')}
            </a>
          </Button>
        </>
      )}

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

/** « Se connecter avec une passkey » : sans e-mail ni mot de passe (clé découvrable). */
function PasskeyLoginButton({ next }: { next: string }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [supported, setSupported] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  if (!supported) return null;

  const signIn = async () => {
    setError(null);
    setPending(true);
    try {
      const { challengeId, options } = await api<PasskeyOptionsDto>('/v1/auth/passkeys/options', {
        method: 'POST',
        json: {},
      });
      const response = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
      await api<AuthResponse>('/v1/auth/passkeys/login', {
        method: 'POST',
        json: { challengeId, response },
      });
      queryClient.clear();
      await clearOfflineData();
      router.replace(next);
      router.refresh();
    } catch (e) {
      const name = (e as Error).name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') setError(t('auth.passkeyFailed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        loading={pending}
        onClick={() => void signIn()}
      >
        <Fingerprint aria-hidden className="size-4" />
        {t('auth.passkey')}
      </Button>
      {error && (
        <p role="alert" className="-mt-2 text-center text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
