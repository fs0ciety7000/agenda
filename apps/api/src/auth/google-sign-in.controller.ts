import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthProvidersDto } from '@agenda/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { randomToken } from '../common/crypto';
import { Public } from '../common/request-context';
import { env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { ACCESS_COOKIE, setAuthCookies } from './cookies';
import { GoogleOidcClient } from './google-oidc.client';
import { TokenService } from './token.service';

const FLOW_COOKIE = 'gn_oauth';
const FLOW_PATH = '/v1/auth/google';

/** Évite les redirections ouvertes : uniquement des chemins internes. */
const safeNext = (next?: string) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

/**
 * Google Sign-In (OIDC, code + PKCE, state et nonce). Le flux passe par la même origine que le web
 * (`/v1/*`), donc les cookies restent first-party.
 *
 * Sécurité : un compte Google n'est JAMAIS rattaché automatiquement à un compte existant ayant le
 * même email (les emails locaux ne sont pas vérifiés : ce serait une prise de contrôle possible).
 * Le rattachement se fait depuis les Réglages, en étant connecté (`mode=link`).
 */
@ApiTags('auth')
@Public()
@Controller({ path: 'auth', version: '1' })
export class GoogleSignInController {
  private readonly logger = new Logger(GoogleSignInController.name);
  private readonly secret = new TextEncoder().encode(env().JWT_SECRET);

  constructor(
    private readonly google: GoogleOidcClient,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {}

  @Get('providers')
  providers(): AuthProvidersDto {
    return {
      google: this.google.configured,
      registration: env().REGISTRATION_ENABLED,
      passwordReset: this.mail.enabled,
    };
  }

  private get redirectUri() {
    return `${env().WEB_ORIGIN}/v1/auth/google/callback`;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: env().COOKIE_SECURE,
      sameSite: 'lax',
      path: FLOW_PATH,
      maxAge: 10 * 60_000,
    };
  }

  @Get('google/start')
  async start(
    @Query('next') next: string | undefined,
    @Query('mode') mode: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.google.configured) return res.redirect('/login?error=GOOGLE_NOT_CONFIGURED');
    let linkUserId: string | undefined;
    if (mode === 'link') {
      const claims = await this.tokens.verifyAccess(
        (req.cookies as Record<string, string>)[ACCESS_COOKIE] ?? '',
      );
      if (!claims || !(await this.auth.isSessionActive(claims.sessionId, claims.userId)))
        return res.redirect('/login');
      linkUserId = claims.userId;
    }
    const state = randomToken(16);
    const nonce = randomToken(16);
    const verifier = randomToken(32);
    const flow = await new SignJWT({ state, nonce, verifier, next: safeNext(next), linkUserId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .setAudience('google-sign-in')
      .sign(this.secret);
    res.cookie(FLOW_COOKIE, flow, this.cookieOptions());
    res.redirect(
      this.google.authorizationUrl({
        redirectUri: this.redirectUri,
        state,
        nonce,
        codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      }),
    );
  }

  @Get('google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.clearCookie(FLOW_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    const fail = (error: string, to = '/login') => res.redirect(`${to}?error=${error}`);
    let flow: { state: string; nonce: string; verifier: string; next: string; linkUserId?: string };
    try {
      const raw = (req.cookies as Record<string, string>)[FLOW_COOKIE];
      flow = (await jwtVerify(raw ?? '', this.secret, { audience: 'google-sign-in' }))
        .payload as typeof flow;
    } catch {
      return fail('GOOGLE_FAILED');
    }
    if (!code || !state || state !== flow.state) return fail('GOOGLE_FAILED');

    let profile;
    try {
      profile = await this.google.exchange({
        code,
        redirectUri: this.redirectUri,
        codeVerifier: flow.verifier,
        nonce: flow.nonce,
      });
    } catch (e) {
      this.logger.warn(`Google sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
      return fail('GOOGLE_FAILED');
    }
    if (!profile.emailVerified || !profile.email) return fail('GOOGLE_FAILED');

    const identity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'GOOGLE', providerSubject: profile.sub } },
      include: { user: true },
    });

    // Rattachement depuis les Réglages (utilisateur déjà connecté).
    if (flow.linkUserId) {
      if (identity && identity.userId !== flow.linkUserId)
        return fail('GOOGLE_ALREADY_LINKED', '/settings');
      if (!identity) {
        await this.prisma.authIdentity.create({
          data: { userId: flow.linkUserId, provider: 'GOOGLE', providerSubject: profile.sub },
        });
      }
      return res.redirect('/settings?linked=google');
    }

    let user = identity && !identity.user.deletedAt ? identity.user : null;
    if (!user) {
      const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (existing) return fail('GOOGLE_EMAIL_EXISTS');
      if (!env().REGISTRATION_ENABLED) return fail('REGISTRATION_CLOSED');
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          displayName: (profile.givenName ?? profile.name ?? profile.email.split('@')[0]!).slice(
            0,
            60,
          ),
          locale: profile.locale?.startsWith('en') ? 'en' : 'fr',
          identities: { create: { provider: 'GOOGLE', providerSubject: profile.sub } },
        },
      });
    }
    const issued = await this.auth.startSession(user, req.headers['user-agent']);
    setAuthCookies(res, issued.accessToken, issued.refreshToken);
    res.redirect(flow.next);
  }
}
