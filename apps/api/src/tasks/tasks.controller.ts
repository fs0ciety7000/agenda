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
  UseInterceptors,
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
  RecurrencePreviewInput,
  type RecurrencePreviewItem,
  ScopeQuery,
  type SeriesDto,
  UpdateOccurrenceInput,
} from '@agenda/contracts';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
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
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(CreateTaskInput)) body: CreateTaskInput,
  ): Promise<OccurrenceDto> {
    return this.tasks.create(ctx, body);
  }

  @Post('tasks/quick')
  @UseInterceptors(IdempotencyInterceptor)
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
    @Query(new ZodPipe(ScopeQuery)) { scope }: ScopeQuery,
  ): Promise<OccurrenceDto> {
    return this.tasks.update(ctx, assertUuid(id), body, scope);
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
    @Query(new ZodPipe(ScopeQuery)) { scope }: ScopeQuery,
  ): Promise<void> {
    return this.tasks.remove(ctx, assertUuid(id), scope);
  }

  /** Tâches récurrentes actives (une ligne par série, avec la prochaine date). */
  @Get('series')
  listSeries(@CurrentHousehold() ctx: HouseholdContext): Promise<SeriesDto[]> {
    return this.tasks.listSeries(ctx);
  }

  @Get('series/:seriesId')
  getSeries(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('seriesId') id: string,
  ): Promise<SeriesDto> {
    return this.tasks.getSeries(ctx, assertUuid(id));
  }

  /** Aperçu des prochaines occurrences et de la rotation (aucune écriture). */
  @Post('recurrence/preview')
  @HttpCode(200)
  previewRecurrence(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(RecurrencePreviewInput)) body: RecurrencePreviewInput,
  ): Promise<RecurrencePreviewItem[]> {
    return this.tasks.preview(ctx, body);
  }

  @Get('balance')
  balance(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(BalanceQuery)) query: BalanceQuery,
  ): Promise<BalanceDto> {
    return this.tasks.balance(ctx, query);
  }
}
