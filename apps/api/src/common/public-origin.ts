import type { Request } from 'express';
import { env } from '../config/env';

/**
 * Domaine public demandé, transmis par le site (proxy `/v1/*` de Next.js : `x-forwarded-host`).
 * Absent pour un appel direct à l'API (tests, outils) : considéré comme le bon domaine.
 */
function requestedHost(req: Request): string | undefined {
  const raw = req.headers['x-forwarded-host'];
  return (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim().toLowerCase() || undefined;
}

/**
 * Vrai si la requête arrive par un autre domaine que `WEB_ORIGIN` (ancien domaine pendant une
 * migration). Les flux OAuth doivent alors repartir de `WEB_ORIGIN` : Google y renvoie toujours,
 * et le cookie du flux posé sur l'autre domaine y serait introuvable.
 */
export function isOtherOrigin(req: Request): boolean {
  const host = requestedHost(req);
  return !!host && host !== new URL(env().WEB_ORIGIN).host.toLowerCase();
}
