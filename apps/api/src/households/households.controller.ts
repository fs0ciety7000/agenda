import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AcceptInvitationInput,
  type CategoryDto,
  CreateHouseholdInput,
  CreateInvitationInput,
  type HouseholdDto,
} from '@agenda/contracts';
import {
  AuthUser,
  CurrentHousehold,
  CurrentUser,
  HouseholdContext,
} from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from './household-member.guard';
import { HouseholdsService } from './households.service';

@ApiTags('households')
@Controller({ version: '1' })
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Post('households')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CreateHouseholdInput)) body: CreateHouseholdInput,
  ): Promise<HouseholdDto> {
    return this.households.create(user.userId, body);
  }

  @Get('households')
  list(@CurrentUser() user: AuthUser): Promise<HouseholdDto[]> {
    return this.households.listForUser(user.userId);
  }

  @Get('households/:householdId')
  @UseGuards(HouseholdMemberGuard)
  get(@CurrentHousehold() ctx: HouseholdContext): Promise<HouseholdDto> {
    return this.households.get(ctx);
  }

  @Get('households/:householdId/categories')
  @UseGuards(HouseholdMemberGuard)
  categories(@CurrentHousehold() ctx: HouseholdContext): Promise<CategoryDto[]> {
    return this.households.listCategories(ctx);
  }

  @Post('households/:householdId/invitations')
  @UseGuards(HouseholdMemberGuard)
  invite(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(CreateInvitationInput)) body: CreateInvitationInput,
  ): Promise<{ token: string; expiresAt: Date }> {
    return this.households.createInvitation(ctx, body);
  }

  @Post('invitations/accept')
  accept(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(AcceptInvitationInput)) body: AcceptInvitationInput,
  ): Promise<HouseholdDto> {
    return this.households.acceptInvitation(user.userId, body);
  }
}
