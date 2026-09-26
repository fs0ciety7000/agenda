import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../common/app-exception';

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'agenda-gn';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF : toute mutation doit porter un header personnalisé. Un formulaire ou une
 * image cross-site ne peut pas l'ajouter, et CORS n'autorise ce header que depuis WEB_ORIGIN.
 * Complète SameSite=Lax sur les cookies. Android l'envoie aussi (règle uniforme).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (req.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
      throw new AppException(
        'CSRF_REJECTED',
        HttpStatus.FORBIDDEN,
        'Missing X-Requested-With header',
      );
    }
    return true;
  }
}
