import { describe, expect, it } from 'vitest';
import { isValidBarcode, normalizeBarcode } from './barcode';

describe('codes-barres', () => {
  it('vérifie la clé de contrôle (EAN-13, EAN-8, UPC-A, GTIN-14)', () => {
    expect(isValidBarcode('2001234567893')).toBe(true);
    expect(isValidBarcode('2001234567890')).toBe(false);
    expect(isValidBarcode('96385074')).toBe(true);
    expect(isValidBarcode('036000291452')).toBe(true);
    expect(isValidBarcode('10012345678902')).toBe(true);
  });

  it('refuse ce qui n’est pas un code produit', () => {
    expect(isValidBarcode('')).toBe(false);
    expect(isValidBarcode('1234567')).toBe(false);
    expect(isValidBarcode('12345678901')).toBe(false);
    expect(isValidBarcode('abcdefgh')).toBe(false);
    expect(isValidBarcode('https://exemple.test')).toBe(false);
  });

  it('retire espaces et tirets', () => {
    expect(normalizeBarcode(' 2 001234-567893 ')).toBe('2001234567893');
  });
});
