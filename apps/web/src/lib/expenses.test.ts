import { describe, expect, it } from 'vitest';
import { looksLikePayment, newExpenseHref, shiftMonth } from './expenses';

describe('looksLikePayment', () => {
  it('reconnaît un paiement en français, anglais et néerlandais', () => {
    for (const title of ['Payer la facture d’électricité', 'Pay rent', 'Huur betalen', 'Loyer']) {
      expect(looksLikePayment(title)).toBe(true);
    }
    expect(looksLikePayment('Appeler le garage', '💰')).toBe(true);
  });

  it('ignore le reste', () => {
    for (const title of ['Sortir les poubelles', 'Paysage à dessiner', 'Arroser les plantes']) {
      expect(looksLikePayment(title)).toBe(false);
    }
  });
});

describe('liens et mois', () => {
  it('lien de formulaire prérempli', () => {
    expect(newExpenseHref({ title: 'Courses', category: 'GROCERIES' })).toBe(
      '/expenses?new=1&title=Courses&category=GROCERIES',
    );
  });

  it('mois précédent / suivant', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
