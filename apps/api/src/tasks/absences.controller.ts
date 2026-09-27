import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type AbsenceDto, CreateAbsenceInput } from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { AbsencesService } from './absences.service';

@ApiTags('absences')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/absences', version: '1' })
export class AbsencesController {
  constructor(private readonly absences: AbsencesService) {}

  /** Absences en cours et à venir. */
  @Get()
  list(@CurrentHousehold() ctx: HouseholdContext): Promise<AbsenceDto[]> {
    return this.absences.list(ctx);
  }

  /** Déclarer une absence (les tâches partagées passent à l'autre membre). */
  @Post()
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(CreateAbsenceInput)) input: CreateAbsenceInput,
  ): Promise<AbsenceDto> {
    return this.absences.create(ctx, input);
  }

  /** Supprimer une absence. */
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('id') id: string): Promise<void> {
    return this.absences.remove(ctx, assertUuid(id));
  }
}
