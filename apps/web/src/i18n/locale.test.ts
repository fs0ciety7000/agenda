import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage } from './locale';

describe('localeFromAcceptLanguage', () => {
  it.each([
    ['fr-FR,fr;q=0.9,en;q=0.8', 'fr'],
    ['en-US,en;q=0.9', 'en'],
    ['de-DE,de;q=0.9,en;q=0.8', 'en'],
    ['de-DE,de;q=0.9,fr;q=0.8', 'fr'],
    ['es-ES', 'en'],
    ['nl-BE,nl;q=0.9,fr;q=0.8', 'nl'],
    ['fr-BE,nl-BE;q=0.9', 'fr'],
    ['nl;q=0.5,fr;q=0.9', 'fr'],
    ['*', 'fr'],
    ['', 'fr'],
    [null, 'fr'],
  ])('%s → %s', (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });
});
