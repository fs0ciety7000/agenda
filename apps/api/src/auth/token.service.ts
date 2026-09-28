import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env';

const ISSUER = 'tandem';
const AUDIENCE = 'tandem-api';
/** Jetons émis avant le renommage : acceptés jusqu'à leur expiration. */
const ACCEPTED_ISSUERS = [ISSUER, 'agenda-gn'];
const ACCEPTED_AUDIENCES = [AUDIENCE, 'agenda-gn-api'];

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/** Access tokens JWT courts (15 min). Les refresh tokens sont opaques (cf. AuthService). */
@Injectable()
export class TokenService {
  private readonly secret = new TextEncoder().encode(env().JWT_SECRET);

  get accessTtlSeconds(): number {
    return env().ACCESS_TOKEN_TTL_SECONDS;
  }

  async signAccess({ userId, sessionId }: AccessClaims): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .sign(this.secret);
  }

  /** Retourne null si le jeton est invalide ou expiré (jamais d'exception). */
  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: ACCEPTED_ISSUERS,
        audience: ACCEPTED_AUDIENCES,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }
}
