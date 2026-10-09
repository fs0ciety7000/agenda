import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env';
import { OpenFoodFactsClient } from './open-food-facts.client';

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  process.env.DATABASE_URL ||= 'postgresql://unit@localhost/unit_test';
  process.env.JWT_SECRET ||= 'unit-secret-unit-secret-unit-secret-1234';
  process.env.WEB_ORIGIN = 'https://tandem-agenda.app';
  delete process.env.OPEN_FOOD_FACTS_URL;
  resetEnvCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPEN_FOOD_FACTS_URL;
  resetEnvCache();
});

describe('Open Food Facts', () => {
  it('nom dans la langue de l’utilisateur, sinon le nom principal, sinon la marque', async () => {
    const client = new OpenFoodFactsClient();
    const fetch = reply(200, {
      status: 1,
      product: { product_name_nl: 'Halfvolle melk', product_name: 'Lait' },
    });
    vi.stubGlobal('fetch', fetch);
    expect(await client.productName('2001234567893', 'nl')).toBe('Halfvolle melk');
    const [url, init] = fetch.mock.calls[0]!;
    // Le code seul, et une application identifiable.
    expect(url).toBe(
      'https://world.openfoodfacts.org/api/v2/product/2001234567893.json?fields=product_name_nl,product_name,brands',
    );
    expect(init.headers['User-Agent']).toBe('Tandem/1.0 (https://tandem-agenda.app)');

    vi.stubGlobal('fetch', reply(200, { status: 1, product: { product_name: ' Lait ' } }));
    expect(await client.productName('2001234567893', 'fr')).toBe('Lait');
    vi.stubGlobal('fetch', reply(200, { status: 1, product: { brands: 'Ferme' } }));
    expect(await client.productName('2001234567893', 'fr')).toBe('Ferme');
  });

  it('inconnu : null ; panne : undefined (rien de retenu)', async () => {
    const client = new OpenFoodFactsClient();
    vi.stubGlobal('fetch', reply(404, { status: 0 }));
    expect(await client.productName('2001234567893', 'fr')).toBeNull();
    vi.stubGlobal('fetch', reply(200, { status: 0 }));
    expect(await client.productName('2001234567893', 'fr')).toBeNull();
    vi.stubGlobal('fetch', reply(503, {}));
    expect(await client.productName('2001234567893', 'fr')).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await client.productName('2001234567893', 'fr')).toBeUndefined();
  });

  it('« off » : jamais interrogé', async () => {
    process.env.OPEN_FOOD_FACTS_URL = 'off';
    resetEnvCache();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await new OpenFoodFactsClient().productName('2001234567893', 'fr')).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
