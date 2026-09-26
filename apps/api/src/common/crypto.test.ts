import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeEncryptionKey, randomToken, SecretBox, sha256Hex } from './crypto';

describe('crypto', () => {
  it('génère des jetons uniques de 256 bits', () => {
    const a = randomToken();
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(randomToken());
  });

  it('hache en SHA-256 hex (64 caractères)', () => {
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('chiffre et déchiffre un refresh token Google', () => {
    const box = new SecretBox(randomBytes(32).toString('base64'));
    const secret = '1//0g-refresh-token';
    const enc = box.encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(enc.startsWith('v1:')).toBe(true);
    expect(box.decrypt(enc)).toBe(secret);
  });

  it('détecte une altération (GCM)', () => {
    const box = new SecretBox(randomBytes(32).toString('base64'));
    const [v, iv, tag, ct] = box.encrypt('secret').split(':');
    const tampered = [v, iv, tag, Buffer.from('xxxxxx').toString('base64url') + ct].join(':');
    expect(() => box.decrypt(tampered)).toThrow();
  });

  it('refuse une clé de mauvaise taille', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow();
  });

  it('clé : base64 ou hex de 32 octets acceptés, le reste refusé avec la commande à utiliser', () => {
    const raw = randomBytes(32);
    expect(decodeEncryptionKey(raw.toString('base64'))).toEqual(raw);
    expect(decodeEncryptionKey(` ${raw.toString('hex')}\n`)).toEqual(raw);
    for (const bad of [
      '',
      'changeme',
      randomBytes(16).toString('base64'),
      randomBytes(48).toString('base64'),
      raw.toString('hex').slice(2),
    ]) {
      expect(() => decodeEncryptionKey(bad)).toThrow(/openssl rand -base64 32/);
    }
  });
});
