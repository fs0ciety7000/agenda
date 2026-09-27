import { describe, expect, it } from 'vitest';
import { guessAisle, parseShoppingText, productKey } from './shopping';

describe('courses : quantités', () => {
  it.each([
    ['2 kg de pommes', 'pommes', '2 kg'],
    ['3 citrons', 'citrons', '3'],
    ['lait x6', 'lait', 'x6'],
    ['Lait ×6', 'Lait', 'x6'],
    ["500 g d'épinards", 'épinards', '500 g'],
    ['beurre 250g', 'beurre', '250g'],
    ['1,5 l de jus', 'jus', '1,5 l'],
    ['Pain', 'Pain', null],
    ['7 up', '7 up', null],
  ])('%s', (text, name, quantity) => {
    expect(parseShoppingText(text)).toEqual({ name, quantity });
  });
});

describe('courses : rayons', () => {
  it.each([
    ['Pommes', 'PRODUCE'],
    ['pommes de terre', 'PRODUCE'],
    ['2 baguettes', 'BAKERY'],
    ['Lait demi-écrémé', 'DAIRY'],
    ['6 œufs', 'DAIRY'],
    ['Filet de saumon', 'MEAT_FISH'],
    ['Pâtes', 'PANTRY'],
    ['Café moulu', 'PANTRY'],
    ['Bière', 'DRINKS'],
    ['Papier toilette', 'HOUSEHOLD'],
    ['Liquide vaisselle', 'HOUSEHOLD'],
    ['Dentifrice', 'HYGIENE'],
    ['Milk', 'DAIRY'],
    ['Piles AA', 'HOUSEHOLD'],
    ['Cadeau pour Léa', 'OTHER'],
  ])('%s → %s', (text, aisle) => {
    expect(guessAisle(text)).toBe(aisle);
  });

  it('clé de produit stable (accents, pluriel, casse)', () => {
    expect(productKey('Épinards')).toBe(productKey('epinard'));
    expect(productKey('  Pommes  ')).toBe('pomme');
  });
});
