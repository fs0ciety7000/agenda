import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type ImportantDateDto, ImportantDateInput } from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { ImportantDatesService } from './important-dates.service';

@ApiTags('important-dates')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/important-dates', version: '1' })
export class ImportantDatesController {
  constructor(private readonly dates: ImportantDatesService) {}

  /** Dates importantes du foyer, les plus proches d'abord. */
  @Get()
  list(@CurrentHousehold() ctx: HouseholdContext): Promise<ImportantDateDto[]> {
    return this.dates.list(ctx);
  }

  /** Ajouter une date importante. */
  @Post()
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(ImportantDateInput)) body: ImportantDateInput,
  ): Promise<ImportantDateDto> {
    return this.dates.create(ctx, body);
  }

  /** Modifier une date importante. */
  @Put(':dateId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('dateId') id: string,
    @Body(new ZodPipe(ImportantDateInput)) body: ImportantDateInput,
  ): Promise<ImportantDateDto> {
    return this.dates.update(ctx, assertUuid(id), body);
  }

  /** Supprimer une date importante. */
  @Delete(':dateId')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('dateId') id: string): Promise<void> {
    return this.dates.remove(ctx, assertUuid(id));
  }
}
