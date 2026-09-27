/*
 * Service worker d'Agenda G & N : le site reste utilisable hors ligne.
 * - Pages : réseau d'abord, sinon la dernière version en cache (puis l'accueil).
 * - Fichiers de l'app (/_next/static, icônes) : cache d'abord (noms versionnés, immuables).
 * - Données (/v1/*) : jamais ici. Elles sont gardées par l'app (cache persistant de TanStack
 *   Query), et les modifications faites hors ligne sont envoyées au retour du réseau.
 */
const STATIC = 'gn-static-v1';
const PAGES = 'gn-pages-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== STATIC && key !== PAGES) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/v1/') || url.pathname === '/healthz' || url.pathname === '/sw.js')
    return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(req, url));
  }
  // Navigation interne (RSC) hors ligne : la requête échoue, Next recharge la page, servie ci-dessus.
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) void cache.put(req, res.clone());
  return res;
}

async function networkFirstPage(req, url) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    // Jamais une redirection (session expirée → /login) à la place de la page demandée.
    if (
      res.ok &&
      !res.redirected &&
      (res.headers.get('content-type') ?? '').includes('text/html')
    ) {
      void cache.put(url.pathname + url.search, res.clone());
      void cache.put(url.pathname, res.clone());
    }
    return res;
  } catch (err) {
    const cached =
      (await cache.match(url.pathname + url.search)) ??
      (await cache.match(url.pathname)) ??
      (await cache.match('/'));
    if (cached) return cached;
    throw err;
  }
}
