import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env';
import { OpenFoodFactsClient, openFoodFactsHealth } from './open-food-facts.client';

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

  it('inconnu : null, sans second essai ; panne : un second essai, puis undefined', async () => {
    const client = new OpenFoodFactsClient();
    const notFound = reply(404, { status: 0 });
    vi.stubGlobal('fetch', notFound);
    expect(await client.productName('2001234567893', 'fr')).toBeNull();
    expect(notFound).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', reply(200, { status: 0 }));
    expect(await client.productName('2001234567893', 'fr')).toBeNull();

    const down = reply(503, {});
    vi.stubGlobal('fetch', down);
    expect(await client.productName('2001234567893', 'fr')).toBeUndefined();
    expect(down).toHaveBeenCalledTimes(2);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await client.productName('2001234567893', 'fr')).toBeUndefined();

    // Lent la première fois, trouvé au second essai.
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 1, product: { product_name: 'Lait' } })),
      );
    vi.stubGlobal('fetch', flaky);
    expect(await client.productName('2001234567893', 'fr')).toBe('Lait');
    expect(flaky).toHaveBeenCalledTimes(2);
    // Vu de l'administration : la panne (et sa cause) puis la réponse qui a suivi.
    const health = openFoodFactsHealth();
    expect(health.enabled).toBe(true);
    expect(health.lastError).toBe('The operation was aborted due to timeout');
    expect(Date.parse(health.lastSuccessAt!)).toBeGreaterThanOrEqual(
      Date.parse(health.lastFailureAt!),
    );
  });

  it('« off » : jamais interrogé', async () => {
    process.env.OPEN_FOOD_FACTS_URL = 'off';
    resetEnvCache();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    // Recherche coupée exprès : produit à nommer, pas une panne.
    expect(await new OpenFoodFactsClient().productName('2001234567893', 'fr')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(openFoodFactsHealth().enabled).toBe(false);
  });
});
