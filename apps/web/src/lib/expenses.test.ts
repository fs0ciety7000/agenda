import { describe, expect, it } from 'vitest';
import { budgetLevel, looksLikePayment, monthSpan, newExpenseHref, shiftMonth } from './expenses';

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

describe('budget et export', () => {
  it("seuil atteint comme l'API : 80 % puis 100 %", () => {
    expect(budgetLevel(7999, 10000)).toBe(0);
    expect(budgetLevel(8000, 10000)).toBe(80);
    expect(budgetLevel(9999, 10000)).toBe(80);
    expect(budgetLevel(10000, 10000)).toBe(100);
    expect(budgetLevel(50000, null)).toBe(0);
  });

  it('nombre de mois, bornes comprises', () => {
    expect(monthSpan('2026-01', '2026-10')).toBe(10);
    expect(monthSpan('2025-11', '2026-02')).toBe(4);
    expect(monthSpan('2026-03', '2026-02')).toBe(0);
  });
});
