import type { ApiErrorBody, ErrorCode } from '@agenda/contracts';

/** Erreur API typée : l'interface affiche `t(\`errors.${code}\`)`, jamais le message technique. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    readonly details?: unknown,
  ) {
    super(code);
  }
}

const CSRF_HEADERS = { 'x-requested-with': 'agenda-gn' };

let refreshing: Promise<boolean> | null = null;

/** Un seul refresh à la fois, partagé par toutes les requêtes en 401. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/v1/auth/refresh', {
    method: 'POST',
    headers: CSRF_HEADERS,
    credentials: 'same-origin',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
  retry = true,
): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      credentials: 'same-origin',
      headers: {
        ...CSRF_HEADERS,
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'NETWORK');
  }

  if (res.status === 401 && retry && !path.startsWith('/v1/auth/')) {
    if (await refreshSession()) return api<T>(path, init, false);
  }
  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'INTERNAL', err?.details);
  }
  return body as T;
}

export const errorKey = (e: unknown): string =>
  e instanceof ApiError && e.code !== 'INTERNAL' && e.code !== 'VERSION_CONFLICT'
    ? e.code
    : 'generic';
