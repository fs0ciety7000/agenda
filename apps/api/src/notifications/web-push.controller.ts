import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type WebPushKeyDto,
  WebPushSubscriptionInput,
  WebPushUnsubscribeInput,
} from '@agenda/contracts';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { WebPushService } from './web-push.service';

/** Notifications du site : abonnements des navigateurs de l'utilisateur connecté. */
@ApiTags('notifications')
@Controller({ path: 'me/web-push', version: '1' })
export class WebPushController {
  constructor(private readonly webPush: WebPushService) {}

  @Get('key')
  key(): WebPushKeyDto {
    return { publicKey: this.webPush.publicKey };
  }

  @Put()
  @HttpCode(204)
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(WebPushSubscriptionInput)) body: WebPushSubscriptionInput,
  ): Promise<void> {
    return this.webPush.subscribe(user.userId, body);
  }

  @Post('unsubscribe')
  @HttpCode(204)
  unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(WebPushUnsubscribeInput)) body: WebPushUnsubscribeInput,
  ): Promise<void> {
    return this.webPush.unsubscribe(user.userId, body.endpoint);
  }
}
