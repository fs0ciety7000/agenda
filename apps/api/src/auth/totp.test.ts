import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  hotp,
  newRecoveryCode,
  otpauthUrl,
  totpStep,
  verifyTotp,
} from './totp';

// Secret des vecteurs de test de la RFC 6238 (annexe B), SHA-1 : « 12345678901234567890 ».
const RFC_SECRET = Buffer.from('12345678901234567890');
const RFC_BASE32 = base32Encode(RFC_SECRET);

describe('TOTP (RFC 6238)', () => {
  it('vecteurs de la RFC (6 derniers chiffres)', () => {
    const vectors: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
    ];
    for (const [seconds, code] of vectors) {
      expect(hotp(RFC_SECRET, totpStep(seconds * 1000))).toBe(code.slice(-6));
    }
  });

  it('base32 aller-retour', () => {
    expect(RFC_BASE32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_BASE32)).toEqual(RFC_SECRET);
  });

  it('un pas d’écart toléré, au-delà refusé, pas de rejeu', () => {
    const at = 1234567890_000;
    const step = totpStep(at);
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_BASE32, code, at, null)).toBe(step);
    expect(verifyTotp(RFC_BASE32, code, at + 30_000, null)).toBe(step);
    expect(verifyTotp(RFC_BASE32, code, at + 90_000, null)).toBeNull();
    // Déjà utilisé : refusé.
    expect(verifyTotp(RFC_BASE32, code, at, step)).toBeNull();
    expect(verifyTotp(RFC_BASE32, '12345', at, null)).toBeNull();
  });

  it('adresse otpauth et codes de secours', () => {
    expect(otpauthUrl('ABC', 'emma@example.be')).toBe(
      'otpauth://totp/Tandem%3Aemma%40example.be?secret=ABC&issuer=Tandem&algorithm=SHA1&digits=6&period=30',
    );
    expect(newRecoveryCode()).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
  });
});
