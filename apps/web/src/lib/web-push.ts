'use client';

import type { WebPushKeyDto } from '@agenda/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export type WebPushState =
  | 'loading'
  /** Navigateur sans Web Push (ou site en développement, sans service worker). */
  | 'unsupported'
  /** Clés VAPID absentes sur le serveur. */
  | 'server-off'
  /** L'utilisateur a bloqué les notifications pour ce site. */
  | 'denied'
  | 'off'
  | 'on';

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** Clé publique VAPID (base64url) → octets attendus par `pushManager.subscribe`. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ?? null;
}

/** Notifications du site sur CE navigateur : état, activer, désactiver. */
export function useWebPush() {
  const [state, setState] = useState<WebPushState>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported()) return setState('unsupported');
    const reg = await registration();
    if (!reg) return setState('unsupported');
    const { publicKey } = await api<WebPushKeyDto>('/v1/me/web-push/key');
    if (!publicKey) return setState('server-off');
    if (Notification.permission === 'denied') return setState('denied');
    const sub = await reg.pushManager.getSubscription();
    setState(sub ? 'on' : 'off');
  }, []);

  useEffect(() => {
    refresh().catch(() => setState('unsupported'));
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    try {
      const reg = await registration();
      const { publicKey } = await api<WebPushKeyDto>('/v1/me/web-push/key');
      if (!reg || !publicKey) return;
      if ((await Notification.requestPermission()) !== 'granted') return;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      await api<void>('/v1/me/web-push', { method: 'PUT', json: sub.toJSON() });
    } finally {
      setBusy(false);
      await refresh().catch(() => {});
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const sub = await (await registration())?.pushManager.getSubscription();
      if (sub) {
        await api<void>('/v1/me/web-push/unsubscribe', {
          method: 'POST',
          json: { endpoint: sub.endpoint },
        }).catch(() => {});
        await sub.unsubscribe();
      }
    } finally {
      setBusy(false);
      await refresh().catch(() => {});
    }
  };

  return { state, busy, enable, disable };
}

/** Déconnexion : ce navigateur cesse de recevoir les notifications du compte. */
export async function unsubscribeWebPush() {
  if (!supported()) return;
  try {
    const sub = await (await registration())?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    /* rien à faire */
  }
}
