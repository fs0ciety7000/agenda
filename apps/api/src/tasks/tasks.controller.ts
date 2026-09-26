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
  type BalanceDto,
  BalanceQuery,
  CreateTaskInput,
  type OccurrenceDto,
  OccurrenceQuery,
  QuickAddInput,
  type QuickAddPreview,
  UpdateOccurrenceInput,
} from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId', version: '1' })
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('tasks')
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(CreateTaskInput)) body: CreateTaskInput,
  ): Promise<OccurrenceDto> {
    return this.tasks.create(ctx, body);
  }

  @Post('tasks/quick')
  quickAdd(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(QuickAddInput)) body: QuickAddInput,
  ): Promise<OccurrenceDto> {
    return this.tasks.quickAdd(ctx, body.text);
  }

  /** Prévisualisation du quick add (aucune écriture). */
  @Post('quick-add/parse')
  @HttpCode(200)
  parse(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(QuickAddInput)) body: QuickAddInput,
  ): Promise<QuickAddPreview> {
    return this.tasks.previewQuickAdd(ctx, body.text);
  }

  @Get('occurrences')
  list(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(OccurrenceQuery)) query: OccurrenceQuery,
  ): Promise<OccurrenceDto[]> {
    return this.tasks.list(ctx, query);
  }

  @Get('occurrences/:occurrenceId')
  get(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<OccurrenceDto> {
    return this.tasks.get(ctx, assertUuid(id));
  }

  @Patch('occurrences/:occurrenceId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
    @Body(new ZodPipe(UpdateOccurrenceInput)) body: UpdateOccurrenceInput,
  ): Promise<OccurrenceDto> {
    return this.tasks.update(ctx, assertUuid(id), body);
  }

  @Post('occurrences/:occurrenceId/complete')
  @HttpCode(200)
  complete(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<OccurrenceDto> {
    return this.tasks.complete(ctx, assertUuid(id));
  }

  @Post('occurrences/:occurrenceId/reopen')
  @HttpCode(200)
  reopen(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<OccurrenceDto> {
    return this.tasks.reopen(ctx, assertUuid(id));
  }

  @Delete('occurrences/:occurrenceId')
  @HttpCode(204)
  remove(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<void> {
    return this.tasks.remove(ctx, assertUuid(id));
  }

  @Get('balance')
  balance(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(BalanceQuery)) query: BalanceQuery,
  ): Promise<BalanceDto> {
    return this.tasks.balance(ctx, query);
  }
}
