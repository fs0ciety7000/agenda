import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../common/app-exception';
import { AppRequest, IS_PUBLIC } from '../common/request-context';
import { AuthService } from './auth.service';
import { ACCESS_COOKIE } from './cookies';
import { TokenService } from './token.service';

/**
 * Guard global. Accepte `Authorization: Bearer` (Android) ou le cookie httpOnly (web).
 * Vérifie aussi que la session n'a pas été révoquée (logout / logout-all effectifs immédiatement).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ?? false;
    const token = bearer
      ? header!.slice(7)
      : (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (!token) throw unauthenticated();

    const claims = await this.tokens.verifyAccess(token);
    if (!claims || !(await this.auth.isSessionActive(claims.sessionId, claims.userId)))
      throw unauthenticated();

    req.user = {
      userId: claims.userId,
      sessionId: claims.sessionId,
      via: bearer ? 'bearer' : 'cookie',
    };
    return true;
  }
}

const unauthenticated = () =>
  new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Authentication required');
