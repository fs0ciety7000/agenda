import { createHmac } from 'node:crypto';
import { safeEqual } from '../common/crypto';

/** Écart toléré entre l'horodatage signé et l'heure du serveur (anti-rejeu). */
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Vérifie un webhook signé par Svix (utilisé par Resend) :
 * HMAC-SHA256(`${svix-id}.${svix-timestamp}.${corps brut}`) avec le secret `whsec_…` (base64),
 * comparé aux signatures `v1,<base64>` de l'en-tête `svix-signature`.
 */
export function verifySvix(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: string,
  nowMs = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  return signature
    .split(' ')
    .map((part) => part.split(','))
    .some(([version, sig]) => version === 'v1' && !!sig && safeEqual(sig, expected));
}

/** Pour les tests : signe comme Svix. */
export function signSvix(secret: string, id: string, timestamp: number, rawBody: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')}`;
}
