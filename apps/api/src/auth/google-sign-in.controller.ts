import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ANDROID_AUTH_REDIRECT,
  type AuthProvidersDto,
  type AuthResponse,
  MobileExchangeInput,
} from '@agenda/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AppException } from '../common/app-exception';
import { randomToken, safeEqual, sha256Hex } from '../common/crypto';
import { ZodPipe } from '../common/zod.pipe';
import { Public } from '../common/request-context';
import { env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { ACCESS_COOKIE, setAuthCookies } from './cookies';
import { GoogleOidcClient } from './google-oidc.client';
import { TokenService } from './token.service';

const FLOW_COOKIE = 'gn_oauth';
const MOBILE_CODE_TTL_MS = 2 * 60_000;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const AUTH_THROTTLE = { default: { limit: () => env().AUTH_RATE_LIMIT, ttl: 60_000 } };
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

  /**
   * `client=android&code_challenge=…` : flux lancé par l'app Android dans un Custom Tab. Google
   * revient sur le web comme d'habitude ; l'API renvoie ensuite vers l'app avec un code à usage
   * unique, échangeable uniquement avec le `code_verifier` resté dans l'app (PKCE).
   */
  @Get('google/start')
  async start(
    @Query('next') next: string | undefined,
    @Query('mode') mode: string | undefined,
    @Query('client') client: string | undefined,
    @Query('code_challenge') mobileChallenge: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const android = client === 'android';
    if (android && !PKCE_CHALLENGE.test(mobileChallenge ?? ''))
      return res.redirect(`${ANDROID_AUTH_REDIRECT}?error=GOOGLE_FAILED`);
    if (!this.google.configured)
      return res.redirect(
        android
          ? `${ANDROID_AUTH_REDIRECT}?error=GOOGLE_NOT_CONFIGURED`
          : '/login?error=GOOGLE_NOT_CONFIGURED',
      );
    let linkUserId: string | undefined;
    if (mode === 'link' && !android) {
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
    const flow = await new SignJWT({
      state,
      nonce,
      verifier,
      next: safeNext(next),
      linkUserId,
      mobileChallenge: android ? mobileChallenge : undefined,
    })
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
    let flow: {
      state: string;
      nonce: string;
      verifier: string;
      next: string;
      linkUserId?: string;
      mobileChallenge?: string;
    };
    try {
      const raw = (req.cookies as Record<string, string>)[FLOW_COOKIE];
      flow = (await jwtVerify(raw ?? '', this.secret, { audience: 'google-sign-in' }))
        .payload as typeof flow;
    } catch {
      return res.redirect('/login?error=GOOGLE_FAILED');
    }
    const fail = (error: string, to = '/login') =>
      res.redirect(`${flow.mobileChallenge ? ANDROID_AUTH_REDIRECT : to}?error=${error}`);
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
    if (flow.mobileChallenge) {
      const code = randomToken(32);
      await this.prisma.mobileAuthCode.create({
        data: {
          userId: user.id,
          codeHash: sha256Hex(code),
          challenge: flow.mobileChallenge,
          expiresAt: new Date(Date.now() + MOBILE_CODE_TTL_MS),
        },
      });
      return res.redirect(`${ANDROID_AUTH_REDIRECT}?code=${code}`);
    }
    const issued = await this.auth.startSession(user, req.headers['user-agent']);
    setAuthCookies(res, issued.accessToken, issued.refreshToken);
    res.redirect(flow.next);
  }

  /** App Android : code à usage unique + verifier PKCE → session (jetons dans la réponse). */
  @Throttle(AUTH_THROTTLE)
  @Post('google/mobile/exchange')
  @HttpCode(200)
  async mobileExchange(
    @Body(new ZodPipe(MobileExchangeInput)) body: MobileExchangeInput,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    const invalid = () =>
      new AppException('GOOGLE_FAILED', HttpStatus.BAD_REQUEST, 'Invalid or expired code');
    const record = await this.prisma.mobileAuthCode.findUnique({
      where: { codeHash: sha256Hex(body.code) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date() || record.user.deletedAt)
      throw invalid();
    const challenge = createHash('sha256').update(body.codeVerifier).digest('base64url');
    if (!safeEqual(challenge, record.challenge)) throw invalid();
    // Usage unique, même en cas de requêtes simultanées.
    const { count } = await this.prisma.mobileAuthCode.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count !== 1) throw invalid();
    return this.auth.startSession(record.user, req.headers['user-agent']);
  }
}
