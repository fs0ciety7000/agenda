import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type SwapDto, type SwapListDto, SwapRequestInput } from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { SwapsService } from './swaps.service';

@ApiTags('swaps')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId', version: '1' })
export class SwapsController {
  constructor(private readonly swaps: SwapsService) {}

  /** Échanges de tour en attente qui me concernent (reçus et envoyés). */
  @Get('swaps')
  list(@CurrentHousehold() ctx: HouseholdContext): Promise<SwapListDto> {
    return this.swaps.list(ctx);
  }

  /** Proposer sa tâche à un autre membre (« Peux-tu prendre ma vaisselle jeudi ? »). */
  @Post('occurrences/:occurrenceId/swap')
  request(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
    @Body(new ZodPipe(SwapRequestInput)) body: SwapRequestInput,
  ): Promise<SwapDto> {
    return this.swaps.request(ctx, assertUuid(id), body);
  }

  /** Accepter une demande reçue : la tâche me revient. */
  @Post('swaps/:swapId/accept')
  @HttpCode(200)
  accept(@CurrentHousehold() ctx: HouseholdContext, @Param('swapId') id: string): Promise<SwapDto> {
    return this.swaps.answer(ctx, assertUuid(id), true);
  }

  /** Refuser une demande reçue (la personne qui l'a envoyée est prévenue). */
  @Post('swaps/:swapId/decline')
  @HttpCode(200)
  decline(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('swapId') id: string,
  ): Promise<SwapDto> {
    return this.swaps.answer(ctx, assertUuid(id), false);
  }

  /** Retirer une demande envoyée, tant qu'elle attend une réponse. */
  @Delete('swaps/:swapId')
  @HttpCode(204)
  cancel(@CurrentHousehold() ctx: HouseholdContext, @Param('swapId') id: string): Promise<void> {
    return this.swaps.cancel(ctx, assertUuid(id));
  }
}
