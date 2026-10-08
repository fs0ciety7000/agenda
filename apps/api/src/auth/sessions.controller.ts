import { Controller, Delete, Get, HttpCode, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { DeviceSessionDto } from '@agenda/contracts';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller({ path: 'me/sessions', version: '1' })
export class SessionsController {
  constructor(private readonly auth: AuthService) {}

  /** Appareils connectés : connexions actives, la plus récemment utilisée d'abord. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<DeviceSessionDto[]> {
    return this.auth.listSessions(user);
  }

  /** Déconnecter tous les autres appareils (la connexion en cours reste ouverte). */
  @Delete()
  @HttpCode(204)
  revokeOthers(@CurrentUser() user: AuthUser): Promise<void> {
    return this.auth.revokeOtherSessions(user);
  }

  /** Déconnecter un appareil à distance (le sien compris). */
  @Delete(':id')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    return this.auth.revokeSession(user, assertUuid(id));
  }
}
