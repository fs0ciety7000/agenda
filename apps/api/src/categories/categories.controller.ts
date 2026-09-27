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
import { type CategoryDto, CategoryInput, UpdateCategoryInput } from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/categories', version: '1' })
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Catégories du foyer. */
  @Get()
  list(@CurrentHousehold() ctx: HouseholdContext): Promise<CategoryDto[]> {
    return this.categories.list(ctx);
  }

  /** Créer une catégorie. */
  @Post()
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(CategoryInput)) body: CategoryInput,
  ): Promise<CategoryDto> {
    return this.categories.create(ctx, body);
  }

  /** Modifier une catégorie. */
  @Patch(':categoryId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('categoryId') id: string,
    @Body(new ZodPipe(UpdateCategoryInput)) body: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    return this.categories.update(ctx, assertUuid(id), body);
  }

  /** Supprimer une catégorie. */
  @Delete(':categoryId')
  @HttpCode(204)
  remove(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('categoryId') id: string,
  ): Promise<void> {
    return this.categories.remove(ctx, assertUuid(id));
  }
}
