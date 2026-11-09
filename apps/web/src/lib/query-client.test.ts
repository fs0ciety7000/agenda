import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeClient } from './query-client';

afterEach(() => {
  vi.useRealTimers();
});

describe('makeClient (rendu serveur)', () => {
  it("n'arme aucun minuteur : le cache disparaît avec la requête", () => {
    vi.useFakeTimers();
    const client = makeClient();
    // Comme useQuery pendant le rendu serveur : la requête est créée sans être lancée.
    client.getQueryCache().build(client, { queryKey: ['today'] });
    client.getQueryCache().build(client, { queryKey: ['shopping'] });
    // Un minuteur de ramasse-miettes garderait tout le cache en mémoire jusqu'à son échéance.
    expect(vi.getTimerCount()).toBe(0);
  });
});
