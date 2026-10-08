import { describe, expect, it } from 'vitest';
import { parseAmountToCents, settleTransfers, splitCents } from './money';

describe('splitCents', () => {
  it('moitié-moitié, centime impair au premier', () => {
    expect(splitCents(1001, [1, 1])).toEqual([501, 500]);
    expect(splitCents(1000, [1, 1])).toEqual([500, 500]);
  });

  it('proportions 60/40 et trois personnes', () => {
    expect(splitCents(1000, [60, 40])).toEqual([600, 400]);
    expect(splitCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('la somme des parts vaut toujours le total', () => {
    for (const total of [1, 7, 999, 12345]) {
      for (const w of [
        [3, 7],
        [1, 2, 3],
        [33, 33, 34],
      ]) {
        expect(splitCents(total, w).reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it('refuse des poids nuls ou un total négatif', () => {
    expect(() => splitCents(100, [0, 0])).toThrow();
    expect(() => splitCents(-1, [1])).toThrow();
  });
});

describe('settleTransfers', () => {
  it('deux personnes : un virement', () => {
    expect(
      settleTransfers([
        { id: 'g', balance: 4250 },
        { id: 'n', balance: -4250 },
      ]),
    ).toEqual([{ from: 'n', to: 'g', amount: 4250 }]);
  });

  it('trois personnes : au plus deux virements, soldes à zéro', () => {
    const t = settleTransfers([
      { id: 'a', balance: 3000 },
      { id: 'b', balance: -1000 },
      { id: 'c', balance: -2000 },
    ]);
    expect(t).toEqual([
      { from: 'c', to: 'a', amount: 2000 },
      { from: 'b', to: 'a', amount: 1000 },
    ]);
  });

  it('rien à rembourser', () => {
    expect(settleTransfers([{ id: 'a', balance: 0 }])).toEqual([]);
  });

  it('refuse des soldes incohérents', () => {
    expect(() => settleTransfers([{ id: 'a', balance: 1 }])).toThrow();
  });
});

describe('parseAmountToCents', () => {
  it('formats courants', () => {
    expect(parseAmountToCents('12,50')).toBe(1250);
    expect(parseAmountToCents('12.5')).toBe(1250);
    expect(parseAmountToCents('12')).toBe(1200);
    expect(parseAmountToCents('1 234,56 €')).toBe(123456);
  });

  it('refuse le reste', () => {
    for (const bad of ['', '0', '-3', '12,345', 'abc', '1.2.3']) {
      expect(parseAmountToCents(bad)).toBeNull();
    }
  });
});
