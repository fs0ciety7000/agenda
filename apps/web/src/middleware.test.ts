import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(siteUrl: string) {
  vi.resetModules();
  vi.stubEnv('SITE_URL', siteUrl);
  return (await import('./middleware')).middleware;
}

const req = (path: string, session = false) =>
  new NextRequest(`https://tandem-agenda.app${path}`, {
    headers: session ? { cookie: 'gn_rt=x' } : {},
  });

describe('middleware : accueil des visiteurs', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('site vitrine configuré : « / » sans session y mène, le reste va à /login', async () => {
    const middleware = await load('https://decouvrir.tandem-agenda.app/');
    const home = middleware(req('/'));
    expect(home.status).toBe(302);
    expect(home.headers.get('location')).toBe('https://decouvrir.tandem-agenda.app/');
    expect(middleware(req('/tasks')).headers.get('location')).toBe(
      'https://tandem-agenda.app/login?next=%2Ftasks',
    );
    // Connecté : l'app, pas de redirection.
    expect(middleware(req('/', true)).headers.get('location')).toBeNull();
    expect(middleware(req('/login')).headers.get('location')).toBeNull();
  });

  it('sans site vitrine : « / » sans session va à /login', async () => {
    const middleware = await load('');
    expect(middleware(req('/')).headers.get('location')).toBe('https://tandem-agenda.app/login');
  });
});
