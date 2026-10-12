import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
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
  type LoginResponse,
  type MeResponse,
  type PasskeyDto,
  PasskeyLoginInput,
  type PasskeyOptionsDto,
  PasskeyRegisterInput,
  RenamePasskeyInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
  RevealNoteInput,
  TwoFactorCodeInput,
  TwoFactorEnableInput,
  TwoFactorLoginInput,
  type TwoFactorRecoveryCodesDto,
  type TwoFactorSetupDto,
  type TwoFactorStatusDto,
  UpdateMeInput,
} from '@agenda/contracts';
import type { Request, Response } from 'express';
import { AppException } from '../common/app-exception';
import { env } from '../config/env';
import { AuthUser, CurrentUser, Public } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService, IssuedTokens } from './auth.service';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies';
import { PasskeysService } from './passkeys.service';
import { PasswordResetService } from './password-reset.service';
import { TwoFactorService } from './two-factor.service';

/** `X-Client: mobile` → tokens dans le corps ; sinon cookies httpOnly (web). */
const isMobile = (client?: string) => client === 'mobile';
const AUTH_THROTTLE = { default: { limit: () => env().AUTH_RATE_LIMIT, ttl: 60_000 } };

@ApiTags('auth')
@Controller({ version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly passkeys: PasskeysService,
    private readonly twoFactor: TwoFactorService,
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

  /**
   * Se connecter (e-mail et mot de passe). Avec la double authentification, la réponse est un
   * défi (`twoFactorRequired`) à compléter par `POST /auth/2fa/verify`.
   */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginInput)) body: LoginInput,
    @Headers('x-client') client: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const user = await this.auth.checkPassword(body);
    if (user.totpEnabledAt) {
      return { twoFactorRequired: true, challengeId: await this.twoFactor.challenge(user.id) };
    }
    return this.respond(await this.auth.startSession(user, req.headers['user-agent']), client, res);
  }

  /** Terminer la connexion avec le code de double authentification (ou un code de secours). */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/2fa/verify')
  @HttpCode(200)
  async verifyTwoFactor(
    @Body(new ZodPipe(TwoFactorLoginInput)) body: TwoFactorLoginInput,
    @Headers('x-client') client: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const issued = await this.twoFactor.completeLogin(
      body.challengeId,
      body.code,
      req.headers['user-agent'],
    );
    return this.respond(issued, client, res);
  }

  /** État de ma double authentification. */
  @Get('me/2fa')
  twoFactorStatus(@CurrentUser() user: AuthUser): Promise<TwoFactorStatusDto> {
    return this.twoFactor.status(user.userId);
  }

  /** Préparer la double authentification : secret à enregistrer dans l'application. */
  @Throttle(AUTH_THROTTLE)
  @Post('me/2fa/setup')
  @HttpCode(200)
  setupTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(RevealNoteInput)) body: RevealNoteInput,
  ): Promise<TwoFactorSetupDto> {
    return this.twoFactor.setup(user, body);
  }

  /** Activer la double authentification (premier code) ; renvoie les codes de secours. */
  @Throttle(AUTH_THROTTLE)
  @Post('me/2fa/enable')
  @HttpCode(200)
  enableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(TwoFactorEnableInput)) body: TwoFactorEnableInput,
  ): Promise<TwoFactorRecoveryCodesDto> {
    return this.twoFactor.enable(user.userId, body.code);
  }

  /** Désactiver la double authentification (code exigé). */
  @Throttle(AUTH_THROTTLE)
  @Post('me/2fa/disable')
  @HttpCode(204)
  disableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(TwoFactorCodeInput)) body: TwoFactorCodeInput,
  ): Promise<void> {
    return this.twoFactor.disable(user.userId, body.code);
  }

  /** Nouveaux codes de secours (code exigé) ; les anciens ne marchent plus. */
  @Throttle(AUTH_THROTTLE)
  @Post('me/2fa/recovery-codes')
  @HttpCode(200)
  regenerateRecoveryCodes(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(TwoFactorCodeInput)) body: TwoFactorCodeInput,
  ): Promise<TwoFactorRecoveryCodesDto> {
    return this.twoFactor.regenerate(user.userId, body.code);
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

  /** Défi pour se connecter avec une passkey. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/passkeys/options')
  @HttpCode(200)
  passkeyLoginOptions(): Promise<PasskeyOptionsDto> {
    return this.passkeys.loginOptions();
  }

  /** Se connecter avec une passkey. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/passkeys/login')
  @HttpCode(200)
  async passkeyLogin(
    @Body(new ZodPipe(PasskeyLoginInput)) body: PasskeyLoginInput,
    @Headers('x-client') client: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.passkeys.login(body, req.headers['user-agent']), client, res);
  }

  /** Mes passkeys. */
  @Get('me/passkeys')
  listPasskeys(@CurrentUser() user: AuthUser): Promise<PasskeyDto[]> {
    return this.passkeys.list(user.userId);
  }

  /** Défi pour ajouter une passkey. */
  @Post('me/passkeys/options')
  @HttpCode(200)
  passkeyRegistrationOptions(@CurrentUser() user: AuthUser): Promise<PasskeyOptionsDto> {
    return this.passkeys.registrationOptions(user.userId);
  }

  /** Ajouter une passkey (réponse du navigateur au défi). */
  @Throttle(AUTH_THROTTLE)
  @Post('me/passkeys')
  registerPasskey(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(PasskeyRegisterInput)) body: PasskeyRegisterInput,
  ): Promise<PasskeyDto> {
    return this.passkeys.register(user.userId, body);
  }

  /** Renommer une passkey. */
  @Patch('me/passkeys/:id')
  renamePasskey(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(RenamePasskeyInput)) body: RenamePasskeyInput,
  ): Promise<PasskeyDto> {
    return this.passkeys.rename(user.userId, id, body.name);
  }

  /** Supprimer une passkey. */
  @Delete('me/passkeys/:id')
  @HttpCode(204)
  removePasskey(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    return this.passkeys.remove(user.userId, id);
  }

  private respond(issued: IssuedTokens, client: string | undefined, res: Response): AuthResponse {
    if (isMobile(client)) {
      return issued;
    }
    setAuthCookies(res, issued.accessToken, issued.refreshToken);
    return { user: issued.user, accessTokenExpiresIn: issued.accessTokenExpiresIn };
  }
}
