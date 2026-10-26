import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env';
import { OpenFoodFactsClient, openFoodFactsHealth, siblingBases } from './open-food-facts.client';

// Une réponse neuve à chaque appel : une même réponse ne se lit qu'une fois.
const reply = (status: number, body: unknown) =>
  vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

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
    // Inconnu de l'alimentaire : hygiène puis autres produits, une fois chacun.
    expect(notFound.mock.calls.map(([url]) => new URL(url as string).host)).toEqual([
      'world.openfoodfacts.org',
      'world.openbeautyfacts.org',
      'world.openproductsfacts.org',
    ]);
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
    expect(health.lastError).toBe(
      'world.openfoodfacts.org: The operation was aborted due to timeout',
    );
    expect(Date.parse(health.lastSuccessAt!)).toBeGreaterThanOrEqual(
      Date.parse(health.lastFailureAt!),
    );
  });

  it('produit non alimentaire : trouvé dans Open Beauty Facts ; base sœur muette sans effet', async () => {
    const client = new OpenFoodFactsClient();
    const byHost = (answers: Record<string, () => Promise<Response>>) =>
      vi.fn().mockImplementation((url: string) => answers[new URL(url).host]!());
    const notFound = () =>
      Promise.resolve(new Response(JSON.stringify({ status: 0 }), { status: 404 }));
    vi.stubGlobal(
      'fetch',
      byHost({
        'world.openfoodfacts.org': notFound,
        'world.openbeautyfacts.org': () =>
          Promise.resolve(
            new Response(
              JSON.stringify({ status: 1, product: { product_name: 'Shampoing doux' } }),
            ),
          ),
        'world.openproductsfacts.org': notFound,
      }),
    );
    expect(await client.productName('2001234567893', 'fr')).toBe('Shampoing doux');

    // Open Beauty Facts en panne, Open Products Facts le connaît.
    vi.stubGlobal(
      'fetch',
      byHost({
        'world.openfoodfacts.org': notFound,
        'world.openbeautyfacts.org': () => Promise.reject(new Error('fetch failed')),
        'world.openproductsfacts.org': () =>
          Promise.resolve(
            new Response(JSON.stringify({ status: 1, product: { brands: 'Lessive Verte' } })),
          ),
      }),
    );
    expect(await client.productName('2001234567893', 'fr')).toBe('Lessive Verte');
  });

  it('miroir ou adresse de test : pas de base sœur', () => {
    expect(siblingBases('https://world.openfoodfacts.org')).toEqual([
      'https://world.openbeautyfacts.org',
      'https://world.openproductsfacts.org',
    ]);
    expect(siblingBases('http://localhost:9999')).toEqual([]);
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
