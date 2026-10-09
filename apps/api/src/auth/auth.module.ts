import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { SessionsController } from './sessions.controller';
import { GoogleOidcClient } from './google-oidc.client';
import { GoogleSignInController } from './google-sign-in.controller';
import { PasskeysService } from './passkeys.service';
import { PasswordResetService } from './password-reset.service';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { VaultService } from './vault.service';

@Module({
  controllers: [AuthController, GoogleSignInController, SessionsController],
  providers: [
    AuthService,
    PasswordService,
    PasswordResetService,
    PasskeysService,
    GoogleOidcClient,
    TokenService,
    VaultService,
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, PasswordService, PasswordResetService, VaultService],
})
export class AuthModule {}
