'use client';

import type { PasskeyDto, PasskeyOptionsDto } from '@agenda/contracts';
import {
  browserSupportsWebAuthn,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

/** Nom proposé pour la passkey de cet appareil (« Chrome sur Android »…). */
function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iPhone'
      : /Mac/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  return [browser, os].filter(Boolean).join(' · ').slice(0, 60) || 'Passkey';
}

/** Réglages → Compte : passkeys (connexion par empreinte, visage ou code de l'appareil). */
export function PasskeySettings() {
  const t = useTranslations('passkeys');
  const format = useFormatter();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['me', 'passkeys'];
  const list = useQuery({ queryKey: key, queryFn: () => api<PasskeyDto[]>('/v1/me/passkeys') });
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  const add = useMutation({
    mutationFn: async () => {
      const { challengeId, options } = await api<PasskeyOptionsDto>('/v1/me/passkeys/options', {
        method: 'POST',
        json: {},
      });
      const response = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      return api<PasskeyDto>('/v1/me/passkeys', {
        method: 'POST',
        json: { challengeId, response, name: deviceName() },
      });
    },
    onSuccess: () => {
      toast({ message: t('added') });
      return qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => {
      // Annulé par l'utilisateur ou déjà enregistrée sur cet appareil : pas une erreur à crier.
      const name = (e as Error).name;
      if (name === 'NotAllowedError' || name === 'AbortError') return;
      toast({
        message: name === 'InvalidStateError' ? t('alreadyHere') : t('error'),
        tone: 'error',
      });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/v1/me/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="font-medium">{t('title')}</p>
      <p className="text-[0.9375rem] text-text-muted">{t('intro')}</p>
      {(list.data ?? []).length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {list.data!.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <Fingerprint aria-hidden className="size-5 shrink-0 text-text-muted" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[0.9375rem]">{p.name}</span>
                <span className="text-[0.8125rem] text-text-muted">
                  {p.lastUsedAt
                    ? t('lastUsed', { date: day(p.lastUsedAt) })
                    : t('created', { date: day(p.createdAt) })}
                  {p.synced ? ` · ${t('synced')}` : ''}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('remove', { name: p.name })}
                onClick={() => window.confirm(t('confirmRemove')) && remove.mutate(p.id)}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <Button
          variant="secondary"
          className="self-start"
          loading={add.isPending}
          onClick={() => add.mutate()}
        >
          <Fingerprint aria-hidden className="size-4" />
          {t('add')}
        </Button>
      ) : (
        <p className="text-[0.8125rem] text-text-muted">{t('unsupported')}</p>
      )}
    </div>
  );
}
