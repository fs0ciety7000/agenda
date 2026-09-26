import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Jeton opaque (refresh, invitation, reset) : 256 bits, base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Les jetons opaques ne sont stockés que sous forme de SHA-256 (hex, 64 caractères). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Clé de chiffrement : 32 octets, en base64 (`openssl rand -base64 32`, recommandé) ou en
 * hexadécimal (`openssl rand -hex 32`). Toute autre valeur est refusée au démarrage.
 */
export function decodeEncryptionKey(value: string): Buffer {
  const v = value.trim();
  const key = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64');
  if (key.length !== 32 || (!/^[0-9a-f]{64}$/i.test(v) && !/^[A-Za-z0-9+/_-]{43}=?$/.test(v))) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be 32 random bytes: generate one with `openssl rand -base64 32`',
    );
  }
  return key;
}

/**
 * Chiffrement AES-256-GCM des secrets tiers (tokens OAuth Google).
 * Format versionné `v1:<iv>:<tag>:<ciphertext>` pour permettre une rotation de clé.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(encodedKey: string) {
    this.key = decodeEncryptionKey(encodedKey);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || !ciphertext)
      throw new Error('Unsupported secret format');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
