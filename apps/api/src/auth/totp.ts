import { createHmac, randomBytes } from 'node:crypto';

/** Codes à usage unique (TOTP, RFC 6238) : HMAC-SHA1, pas de 30 s, 6 chiffres. */
const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secret de 160 bits (taille recommandée par la RFC 4226), en base32 pour les applications. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** Pas de 30 s contenant `at`. */
export const totpStep = (at: number) => Math.floor(at / 1000 / STEP_SECONDS);

/** Code du pas `step` (RFC 4226 §5.3, troncature dynamique). */
export function hotp(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, '0');
}

/**
 * Pas accepté pour `code` (horloge du téléphone décalée d'un pas au plus, dans un sens ou dans
 * l'autre), ou null. Un pas déjà utilisé (`lastStep`) est refusé : pas de rejeu.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  at: number,
  lastStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(at);
  for (const step of [current, current - 1, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (hotp(secret, step) === code) return step;
  }
  return null;
}

/** Adresse lue par les applications d'authentification (QR code). */
export function otpauthUrl(secretBase32: string, account: string, issuer = 'Tandem'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Code de secours « abcd-efgh » : 40 bits en base32 minuscule, facile à recopier. */
export function newRecoveryCode(): string {
  const text = base32Encode(randomBytes(5)).toLowerCase();
  return `${text.slice(0, 4)}-${text.slice(4, 8)}`;
}

/** Forme comparée (et hachée) d'un code de secours, avec ou sans tiret. */
export const normalizeRecoveryCode = (code: string) => code.replace(/[\s-]/g, '').toLowerCase();
