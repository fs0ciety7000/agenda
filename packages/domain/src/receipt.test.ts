import { describe, expect, it } from 'vitest';
import { readReceipt } from './receipt';

const TODAY = '2026-10-09';

describe('readReceipt', () => {
  it('ticket français : total TTC, date jj/mm/aaaa, commerçant en capitales', () => {
    const text = `
      SUPERMARCHE DU PARC
      12 rue des Lilas 1000 Bruxelles
      Tél. 02 123 45 67
      PAIN COMPLET          2,35
      LAIT DEMI-ECREME      1,19
      SOUS-TOTAL            3,54
      TVA 6%                0,21
      TOTAL TTC             3,54 €
      CB                    3,54
      08/10/2026 18:42  Caisse 3
      Merci de votre visite
    `;
    expect(readReceipt(text, TODAY)).toEqual({
      amountCents: 354,
      date: '2026-10-08',
      merchant: 'Supermarche Du Parc',
    });
  });

  it('ticket néerlandais : « Te betalen » sur la ligne suivante, date jj-mm-aa', () => {
    const text = `Bakkerij Janssens
      Kassabon
      Croissant 2x       3,60
      Te betalen
      EUR 12,80
      Wisselgeld         7,20
      Datum: 07-10-26`;
    expect(readReceipt(text, TODAY)).toEqual({
      amountCents: 1280,
      date: '2026-10-07',
      merchant: 'Bakkerij Janssens',
    });
  });

  it('ticket anglais : milliers, date ISO, mois en lettres', () => {
    expect(readReceipt('Garage Martin\nAmount due  1,234.50\n2026-09-30', TODAY)).toMatchObject({
      amountCents: 123450,
      date: '2026-09-30',
    });
    expect(readReceipt('TOTAAL 1.234,56\n5 okt 2026', TODAY)).toMatchObject({
      amountCents: 123456,
      date: '2026-10-05',
    });
    expect(readReceipt('Total 45,00\n3 septembre 2026', TODAY).date).toBe('2026-09-03');
  });

  it('sans mot-clé : le plus grand montant, hors TVA et monnaie rendue', () => {
    expect(readReceipt('Article 4,20\nArticle 9,90\nTVA 21% 99,99', TODAY).amountCents).toBe(990);
  });

  it('une date dans le texte ne devient pas un montant', () => {
    expect(readReceipt('Le 12.10.2025 à 10:30\nArticle 4,20', TODAY)).toMatchObject({
      amountCents: 420,
      date: '2025-10-12',
    });
  });

  it('dates impossibles ou improbables écartées', () => {
    expect(readReceipt('31/02/2026\nTotal 5,00', TODAY).date).toBeNull();
    // Dans le futur, ou il y a plus de deux ans : sans doute un autre nombre.
    expect(readReceipt('25/12/2026', TODAY).date).toBeNull();
    expect(readReceipt('01/01/2020', TODAY).date).toBeNull();
    // Demain : toléré (fuseau, horloge de la caisse).
    expect(readReceipt('10/10/2026', TODAY).date).toBe('2026-10-10');
  });

  it('texte illisible : rien de proposé', () => {
    expect(readReceipt('', TODAY)).toEqual({ amountCents: null, date: null, merchant: null });
    expect(readReceipt('~~ ## 12 //\n%%%', TODAY)).toEqual({
      amountCents: null,
      date: null,
      merchant: null,
    });
  });

  it('commerçant : saute les formules de politesse, garde la casse mixte, coupe à 60', () => {
    expect(readReceipt('Bienvenue\nChez Léa & Fils\nTotal 3,00', TODAY).merchant).toBe(
      'Chez Léa & Fils',
    );
    expect(readReceipt(`${'Boulangerie '.repeat(8)}`, TODAY).merchant).toHaveLength(60);
  });
});
