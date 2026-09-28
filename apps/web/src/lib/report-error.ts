/** Remontée d'une erreur du navigateur à l'API (logs + Sentry). Jamais bloquant, jamais en boucle. */
const MAX_PER_PAGE = 5;
let sent = 0;
const seen = new Set<string>();

export function reportError(error: unknown, context?: string): void {
  if (typeof window === 'undefined' || sent >= MAX_PER_PAGE) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.message}|${context ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent += 1;
  void fetch('/v1/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'tandem' },
    keepalive: true,
    body: JSON.stringify({
      source: 'web',
      message: err.message.slice(0, 500) || 'Unknown error',
      stack: err.stack?.slice(0, 8000),
      // Chemin seulement : les paramètres peuvent contenir des jetons (reset, invitation).
      location: (context ?? window.location.pathname).slice(0, 200),
    }),
  }).catch(() => undefined);
}
