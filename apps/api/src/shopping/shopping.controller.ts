import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type ShoppingItemDto,
  ShoppingItemInput,
  type ShoppingSuggestionDto,
  UpdateShoppingItemInput,
} from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { ShoppingService } from './shopping.service';

@ApiTags('shopping')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/shopping', version: '1' })
export class ShoppingController {
  constructor(private readonly shopping: ShoppingService) {}

  @Get()
  list(@CurrentHousehold() ctx: HouseholdContext): Promise<ShoppingItemDto[]> {
    return this.shopping.list(ctx);
  }

  @Get('suggestions')
  suggestions(@CurrentHousehold() ctx: HouseholdContext): Promise<ShoppingSuggestionDto[]> {
    return this.shopping.suggestions(ctx);
  }

  @Post()
  add(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(ShoppingItemInput)) body: ShoppingItemInput,
  ): Promise<ShoppingItemDto> {
    return this.shopping.add(ctx, body);
  }

  @Post('clear-done')
  @HttpCode(204)
  clearDone(@CurrentHousehold() ctx: HouseholdContext): Promise<void> {
    return this.shopping.clearDone(ctx);
  }

  @Patch(':itemId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('itemId') id: string,
    @Body(new ZodPipe(UpdateShoppingItemInput)) body: UpdateShoppingItemInput,
  ): Promise<ShoppingItemDto> {
    return this.shopping.update(ctx, assertUuid(id), body);
  }

  @Delete(':itemId')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('itemId') id: string): Promise<void> {
    return this.shopping.remove(ctx, assertUuid(id));
  }
}
