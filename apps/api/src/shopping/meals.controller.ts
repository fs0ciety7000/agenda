import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type MealDto,
  MealInput,
  MealsQuery,
  MealsToShoppingInput,
  type MealsToShoppingDto,
  type MealSuggestionDto,
  UpdateMealInput,
} from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { MealsService } from './meals.service';

@ApiTags('meals')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/meals', version: '1' })
export class MealsController {
  constructor(private readonly meals: MealsService) {}

  /** Repas prévus entre deux dates (62 jours au plus). */
  @Get()
  list(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(MealsQuery)) query: MealsQuery,
  ): Promise<MealDto[]> {
    return this.meals.list(ctx, query);
  }

  /** Repas déjà faits, à reprendre. */
  @Get('suggestions')
  suggestions(@CurrentHousehold() ctx: HouseholdContext): Promise<MealSuggestionDto[]> {
    return this.meals.suggestions(ctx);
  }

  /** Prévoir un repas. */
  @Post()
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(MealInput)) body: MealInput,
  ): Promise<MealDto> {
    return this.meals.create(ctx, body);
  }

  /** Envoyer les ingrédients de repas à la liste de courses. */
  @Post('shopping')
  @HttpCode(200)
  toShopping(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(MealsToShoppingInput)) body: MealsToShoppingInput,
  ): Promise<MealsToShoppingDto> {
    return this.meals.toShopping(ctx, body.mealIds);
  }

  /** Modifier un repas. */
  @Patch(':mealId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('mealId') id: string,
    @Body(new ZodPipe(UpdateMealInput)) body: UpdateMealInput,
  ): Promise<MealDto> {
    return this.meals.update(ctx, assertUuid(id), body);
  }

  /** Retirer un repas. */
  @Delete(':mealId')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('mealId') id: string): Promise<void> {
    return this.meals.remove(ctx, assertUuid(id));
  }
}
