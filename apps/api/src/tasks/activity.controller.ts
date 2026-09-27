import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type ActivityPageDto, ActivityQuery, type TrashItemDto } from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { ActivityService } from './activity.service';

@ApiTags('activity')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId', version: '1' })
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  /** Journal d'activité, du plus récent au plus ancien (pagination par curseur). */
  @Get('activity')
  list(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(ActivityQuery)) query: ActivityQuery,
  ): Promise<ActivityPageDto> {
    return this.activity.list(ctx, query);
  }

  @Get('trash')
  trash(@CurrentHousehold() ctx: HouseholdContext): Promise<TrashItemDto[]> {
    return this.activity.trash(ctx);
  }

  @Post('trash/:id/restore')
  @HttpCode(200)
  restore(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('id') id: string,
  ): Promise<{ occurrenceId: string | null }> {
    return this.activity.restore(ctx, assertUuid(id));
  }

  /** Annuler une suppression depuis la tâche elle-même (bouton « Annuler »). */
  @Post('occurrences/:occurrenceId/restore')
  @HttpCode(200)
  restoreOccurrence(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<{ occurrenceId: string | null }> {
    return this.activity.restoreOccurrence(ctx, assertUuid(id));
  }
}
