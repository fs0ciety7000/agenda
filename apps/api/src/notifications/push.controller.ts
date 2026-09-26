import { Body, Controller, Delete, HttpCode, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PushTokenInput } from '@agenda/contracts';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PushService } from './push.service';

/** Jetons de notification des téléphones de l'utilisateur connecté. */
@ApiTags('notifications')
@Controller({ path: 'me/push-tokens', version: '1' })
export class PushController {
  constructor(private readonly push: PushService) {}

  @Put()
  @HttpCode(204)
  register(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(PushTokenInput)) body: PushTokenInput,
  ): Promise<void> {
    return this.push.register(user.userId, body.token, body.platform);
  }

  /** Déconnexion : ce téléphone ne reçoit plus rien pour ce compte. */
  @Delete(':token')
  @HttpCode(204)
  unregister(@CurrentUser() user: AuthUser, @Param('token') token: string): Promise<void> {
    return this.push.unregister(user.userId, token);
  }
}
