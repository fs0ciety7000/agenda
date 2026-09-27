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

  /** Liste de courses. */
  @Get()
  list(@CurrentHousehold() ctx: HouseholdContext): Promise<ShoppingItemDto[]> {
    return this.shopping.list(ctx);
  }

  /** Articles souvent achetés. */
  @Get('suggestions')
  suggestions(@CurrentHousehold() ctx: HouseholdContext): Promise<ShoppingSuggestionDto[]> {
    return this.shopping.suggestions(ctx);
  }

  /** Ajouter des articles (texte libre, un par ligne). */
  @Post()
  add(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(ShoppingItemInput)) body: ShoppingItemInput,
  ): Promise<ShoppingItemDto> {
    return this.shopping.add(ctx, body);
  }

  /** Retirer les articles cochés. */
  @Post('clear-done')
  @HttpCode(204)
  clearDone(@CurrentHousehold() ctx: HouseholdContext): Promise<void> {
    return this.shopping.clearDone(ctx);
  }

  /** Modifier ou cocher un article. */
  @Patch(':itemId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('itemId') id: string,
    @Body(new ZodPipe(UpdateShoppingItemInput)) body: UpdateShoppingItemInput,
  ): Promise<ShoppingItemDto> {
    return this.shopping.update(ctx, assertUuid(id), body);
  }

  /** Supprimer un article. */
  @Delete(':itemId')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('itemId') id: string): Promise<void> {
    return this.shopping.remove(ctx, assertUuid(id));
  }
}
