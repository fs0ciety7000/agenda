'use client';

import type {
  TwoFactorRecoveryCodesDto,
  TwoFactorSetupDto,
  TwoFactorStatusDto,
} from '@agenda/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Download, ShieldCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorKey } from '@/lib/api';
import { queryKeys } from '@/lib/queries';
import { saveFile } from '@/lib/backup';

type Step =
  | { kind: 'verify'; method: 'password' | 'confirm' }
  | { kind: 'scan'; setup: TwoFactorSetupDto }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'disable' }
  | { kind: 'regenerate' };

const STATUS_KEY = ['me', '2fa'];

/**
 * Réglages → Compte : double authentification. Activer (mot de passe, QR code, premier code),
 * codes de secours (montrés une fois), nouveaux codes, désactiver (code exigé).
 */
export function TwoFactorSettings() {
  const t = useTranslations('twoFactor');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const format = useFormatter();
  const toast = useToast();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api<TwoFactorStatusDto>('/v1/me/2fa'),
  });
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState('');

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: STATUS_KEY }),
      qc.invalidateQueries({ queryKey: queryKeys.me }),
    ]);
  const close = () => {
    setStep(null);
    setError(null);
    setValue('');
  };
  const message = (e: unknown) => te(errorKey(e) as 'generic');

  /** Secret proposé ; le site demande d'abord le mot de passe (ou une confirmation). */
  const start = async (input: { password?: string; confirm?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const setup = await api<TwoFactorSetupDto>('/v1/me/2fa/setup', {
        method: 'POST',
        json: input,
      });
      setValue('');
      setStep({ kind: 'scan', setup });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VAULT_LOCKED') {
        const m = (e.details as { method?: string } | undefined)?.method;
        setStep({ kind: 'verify', method: m === 'confirm' ? 'confirm' : 'password' });
      } else if (step) {
        setError(message(e));
      } else {
        toast({ message: message(e), tone: 'error' });
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!step) return;
    if (step.kind === 'verify') {
      await start(step.method === 'password' ? { password: value } : { confirm: true });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (step.kind === 'scan') {
        const res = await api<TwoFactorRecoveryCodesDto>('/v1/me/2fa/enable', {
          method: 'POST',
          json: { code: value },
        });
        setStep({ kind: 'codes', codes: res.codes });
        toast({ message: t('enabledToast') });
      } else if (step.kind === 'regenerate') {
        const res = await api<TwoFactorRecoveryCodesDto>('/v1/me/2fa/recovery-codes', {
          method: 'POST',
          json: { code: value },
        });
        setStep({ kind: 'codes', codes: res.codes });
      } else if (step.kind === 'disable') {
        await api<void>('/v1/me/2fa/disable', { method: 'POST', json: { code: value } });
        close();
        toast({ message: t('disabledToast') });
      }
      setValue('');
      await refresh();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const data = status.data;
  if (!data?.available) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
        <ShieldCheck aria-hidden className="size-4 text-text-muted" />
        {t('title')}
      </h3>
      <p className="text-[0.9375rem] text-text-muted">{t('intro')}</p>
      {data.enabled ? (
        <>
          <p className="text-[0.9375rem]">
            {data.enabledAt
              ? t('enabledOn', {
                  date: format.dateTime(new Date(data.enabledAt), { dateStyle: 'long' }),
                })
              : t('enabled')}
          </p>
          <p className="text-[0.8125rem] text-text-muted">
            {t('codesLeft', { count: data.recoveryCodesLeft })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep({ kind: 'regenerate' })}>
              {t('newCodes')}
            </Button>
            <Button variant="ghost" onClick={() => setStep({ kind: 'disable' })}>
              {t('disable')}
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          loading={busy && !step}
          onClick={() => void start()}
        >
          {t('enable')}
        </Button>
      )}

      <Dialog open={step !== null} onOpenChange={(o) => !o && close()}>
        {step && (
          <DialogContent
            title={t(
              step.kind === 'verify'
                ? 'verifyTitle'
                : step.kind === 'scan'
                  ? 'scanTitle'
                  : step.kind === 'codes'
                    ? 'codesTitle'
                    : step.kind === 'disable'
                      ? 'disableTitle'
                      : 'newCodesTitle',
            )}
            description={t(
              step.kind === 'verify'
                ? step.method === 'confirm'
                  ? 'verifyConfirm'
                  : 'verifyPassword'
                : step.kind === 'scan'
                  ? 'scanIntro'
                  : step.kind === 'codes'
                    ? 'codesIntro'
                    : step.kind === 'disable'
                      ? 'disableIntro'
                      : 'newCodesIntro',
            )}
            closeLabel={tc('close')}
          >
            {step.kind === 'codes' ? (
              <RecoveryCodes codes={step.codes} onDone={close} />
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
                {step.kind === 'scan' && <Secret setup={step.setup} />}
                {step.kind === 'verify' && step.method === 'confirm' ? (
                  error && (
                    <p role="alert" className="text-sm text-danger">
                      {error}
                    </p>
                  )
                ) : (
                  <Field
                    label={t(step.kind === 'verify' ? 'password' : 'code')}
                    type={step.kind === 'verify' ? 'password' : 'text'}
                    autoComplete={step.kind === 'verify' ? 'current-password' : 'one-time-code'}
                    inputMode={step.kind === 'scan' ? 'numeric' : undefined}
                    hint={
                      step.kind === 'disable' || step.kind === 'regenerate'
                        ? t('codeHint')
                        : undefined
                    }
                    autoFocus
                    spellCheck={false}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    error={error ?? undefined}
                  />
                )}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant={step.kind === 'disable' ? 'danger' : 'primary'}
                    loading={busy}
                    disabled={
                      !(step.kind === 'verify' && step.method === 'confirm') && !value.trim()
                    }
                  >
                    {t(
                      step.kind === 'verify'
                        ? 'continue'
                        : step.kind === 'disable'
                          ? 'disable'
                          : step.kind === 'regenerate'
                            ? 'newCodes'
                            : 'verify',
                    )}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** QR code de l'adresse otpauth (chargé à l'ouverture), et le secret à taper à la main. */
function Secret({ setup }: { setup: TwoFactorSetupDto }) {
  const t = useTranslations('twoFactor');
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode').then(({ toDataURL }) =>
      toDataURL(setup.otpauthUrl, { margin: 1, width: 192 }).then((url) => alive && setQr(url)),
    );
    return () => {
      alive = false;
    };
  }, [setup.otpauthUrl]);
  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR code : toujours noir sur blanc, lisible par l'appareil photo dans les deux thèmes. */}
      <div className="size-48 rounded-md border border-border bg-surface p-0">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- image générée dans la page
          <img
            src={qr}
            alt={t('qrAlt')}
            width={192}
            height={192}
            className="size-full rounded-md"
          />
        )}
      </div>
      <a
        href={setup.otpauthUrl}
        className="text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        {t('openApp')}
      </a>
      <p className="text-center text-[0.8125rem] text-text-muted">
        {t('secretLabel')}{' '}
        <code className="break-all font-mono text-text">
          {setup.secret.match(/.{1,4}/g)?.join(' ')}
        </code>
      </p>
    </div>
  );
}

/** Codes de secours : montrés une seule fois, à copier ou télécharger. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations('twoFactor');
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-2 rounded-md bg-surface-muted p-3 font-mono text-[0.9375rem]">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
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
        <Button
          variant="secondary"
          onClick={() => saveFile(new Blob([`${text}\n`], { type: 'text/plain' }), t('fileName'))}
        >
          <Download aria-hidden className="size-4" />
          {t('download')}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button onClick={onDone}>{t('done')}</Button>
      </div>
    </div>
  );
}
