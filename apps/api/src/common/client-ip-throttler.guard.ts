import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { env } from '../config/env';

/**
 * En production, l'API ne voit que l'IP du conteneur web (rewrite Next.js) : sans cela, la limite
 * serait partagée par tous les utilisateurs. On lit l'IP client dans l'en-tête configuré
 * (`cf-connecting-ip`, posé par Cloudflare et non falsifiable quand Cloudflare est devant).
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientIp(req as unknown as Request));
  }
}

export function clientIp(req: Request): string {
  const header = env().CLIENT_IP_HEADER;
  const value = header ? req.headers[header] : undefined;
  const first = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}
