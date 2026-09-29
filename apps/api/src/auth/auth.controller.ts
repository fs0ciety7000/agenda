import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthResponse,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  type MeResponse,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateMeInput,
} from '@agenda/contracts';
import type { Request, Response } from 'express';
import { AppException } from '../common/app-exception';
import { env } from '../config/env';
import { AuthUser, CurrentUser, Public } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService, IssuedTokens } from './auth.service';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies';
import { PasswordResetService } from './password-reset.service';

/** `X-Client: mobile` → tokens dans le corps ; sinon cookies httpOnly (web). */
const isMobile = (client?: string) => client === 'mobile';
const AUTH_THROTTLE = { default: { limit: () => env().AUTH_RATE_LIMIT, ttl: 60_000 } };

@ApiTags('auth')
@Controller({ version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  /** Créer un compte. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/register')
  async register(
    @Body(new ZodPipe(RegisterInput)) body: RegisterInput,
    @Headers('x-client') client: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.register(body, req.headers['user-agent']), client, res);
  }

  /** Se connecter (e-mail et mot de passe). */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginInput)) body: LoginInput,
    @Headers('x-client') client: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.login(body, req.headers['user-agent']), client, res);
  }

  /** Renouveler les jetons (cookie de rafraîchissement ou `refreshToken` dans le corps). */
  @Public()
  @Throttle({ default: { limit: () => env().AUTH_RATE_LIMIT * 3, ttl: 60_000 } })
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodPipe(RefreshInput)) body: RefreshInput,
    @Headers('x-client') client: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = body.refreshToken ?? (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    if (!token)
      throw new AppException('SESSION_EXPIRED', HttpStatus.UNAUTHORIZED, 'No refresh token');
    try {
      return this.respond(await this.auth.refresh(token, req.headers['user-agent']), client, res);
    } catch (e) {
      clearAuthCookies(res);
      throw e;
    }
  }

  /** Se déconnecter de cet appareil. */
  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodPipe(RefreshInput)) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = body.refreshToken ?? (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    if (token) await this.auth.logoutByRefreshToken(token);
    clearAuthCookies(res);
  }

  /** Se déconnecter de tous les appareils. */
  @Post('auth/logout-all')
  @HttpCode(204)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.userId);
    clearAuthCookies(res);
  }

  /** Toujours 202 : ne révèle pas si un compte existe pour cet email. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/password/forgot')
  @HttpCode(202)
  async forgotPassword(
    @Body(new ZodPipe(ForgotPasswordInput)) body: ForgotPasswordInput,
  ): Promise<void> {
    this.passwordReset.requestInBackground(body.email);
  }

  /** Choisir un nouveau mot de passe avec le jeton reçu par e-mail. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/password/reset')
  @HttpCode(204)
  async resetPassword(
    @Body(new ZodPipe(ResetPasswordInput)) body: ResetPasswordInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.passwordReset.reset(body.token, body.password);
    clearAuthCookies(res);
  }

  /** Changer son mot de passe. */
  @Throttle(AUTH_THROTTLE)
  @Post('auth/password/change')
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ChangePasswordInput)) body: ChangePasswordInput,
  ): Promise<void> {
    return this.auth.changePassword(user, body);
  }

  /** Délier le compte Google. */
  @Delete('auth/google')
  @HttpCode(204)
  unlinkGoogle(@CurrentUser() user: AuthUser): Promise<void> {
    return this.auth.unlinkGoogle(user.userId);
  }

  /** Profil de l'utilisateur connecté. */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.auth.me(user.userId);
  }

  /** Changer ses préférences (langue). */
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(UpdateMeInput)) body: UpdateMeInput,
  ): Promise<MeResponse> {
    return this.auth.updateMe(user.userId, body);
  }

  private respond(issued: IssuedTokens, client: string | undefined, res: Response): AuthResponse {
    if (isMobile(client)) {
      return issued;
    }
    setAuthCookies(res, issued.accessToken, issued.refreshToken);
    return { user: issued.user, accessTokenExpiresIn: issued.accessTokenExpiresIn };
  }
}
