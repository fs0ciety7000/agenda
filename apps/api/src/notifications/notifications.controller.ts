import { Body, Controller, Get, HttpCode, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  MarkReadInput,
  type NotificationListDto,
  type NotificationPreferenceDto,
  NotificationQuery,
  UpdatePreferencesInput,
} from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Centre de notifications. */
  @Get('notifications')
  list(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(NotificationQuery)) query: NotificationQuery,
  ): Promise<NotificationListDto> {
    return this.notifications.list(ctx, query);
  }

  /** Sans `ids` : tout marquer comme lu. */
  @Post('notifications/read')
  @HttpCode(204)
  markRead(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(MarkReadInput)) body: MarkReadInput,
  ): Promise<void> {
    return this.notifications.markRead(ctx, body.ids);
  }

  /** Préférences de notification. */
  @Get('notification-preferences')
  preferences(@CurrentHousehold() ctx: HouseholdContext): Promise<NotificationPreferenceDto[]> {
    return this.notifications.preferences(ctx);
  }

  /** Modifier les préférences de notification. */
  @Put('notification-preferences')
  updatePreferences(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(UpdatePreferencesInput)) body: UpdatePreferencesInput,
  ): Promise<NotificationPreferenceDto[]> {
    return this.notifications.updatePreferences(ctx, body.preferences);
  }
}
