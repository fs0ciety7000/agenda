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
  ChecklistItemInput,
  CreateTaskInput,
  type OccurrenceDto,
  OccurrenceQuery,
  QuickAddInput,
  type QuickAddPreview,
  RecurrencePreviewInput,
  type StatsDto,
  StatsQuery,
  type WeeklyReviewDto,
  WeeklyReviewQuery,
  type RecurrencePreviewItem,
  ScopeQuery,
  type SeriesDto,
  type SeriesHistoryDto,
  UpdateChecklistItemInput,
  UpdateOccurrenceInput,
} from '@agenda/contracts';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { ReviewService } from './review.service';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId', version: '1' })
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly reviews: ReviewService,
  ) {}

  /** Créer une tâche (ponctuelle ou répétée). */
  @Post('tasks')
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(CreateTaskInput)) body: CreateTaskInput,
  ): Promise<OccurrenceDto> {
    return this.tasks.create(ctx, body);
  }

  /** Ajout rapide en langage naturel (« Sortir les poubelles mardi 20h @Grace »). */
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

  /** Lister les occurrences (vue, période, filtres). */
  @Get('occurrences')
  list(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(OccurrenceQuery)) query: OccurrenceQuery,
  ): Promise<OccurrenceDto[]> {
    return this.tasks.list(ctx, query);
  }

  /** Détail d'une occurrence. */
  @Get('occurrences/:occurrenceId')
  get(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<OccurrenceDto> {
    return this.tasks.get(ctx, assertUuid(id));
  }

  /** Modifier une occurrence (portée : celle-ci, les suivantes, toutes). */
  @Patch('occurrences/:occurrenceId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
    @Body(new ZodPipe(UpdateOccurrenceInput)) body: UpdateOccurrenceInput,
    @Query(new ZodPipe(ScopeQuery)) { scope }: ScopeQuery,
  ): Promise<OccurrenceDto> {
    return this.tasks.update(ctx, assertUuid(id), body, scope);
  }

  /** Marquer comme faite. */
  @Post('occurrences/:occurrenceId/complete')
  @HttpCode(200)
  complete(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<OccurrenceDto> {
    return this.tasks.complete(ctx, assertUuid(id));
  }

  /** Dire « merci » pour une tâche faite par quelqu'un d'autre. */
  @Post('occurrences/:occurrenceId/thanks')
  @HttpCode(200)
  thank(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<OccurrenceDto> {
    return this.tasks.thank(ctx, assertUuid(id));
  }

  /** Retirer son « merci ». */
  @Delete('occurrences/:occurrenceId/thanks')
  unthank(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<OccurrenceDto> {
    return this.tasks.unthank(ctx, assertUuid(id));
  }

  /** Marquer comme à faire. */
  @Post('occurrences/:occurrenceId/reopen')
  @HttpCode(200)
  reopen(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<OccurrenceDto> {
    return this.tasks.reopen(ctx, assertUuid(id));
  }

  /** Ajouter une sous-tâche. */
  @Post('occurrences/:occurrenceId/checklist')
  addChecklistItem(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
    @Body(new ZodPipe(ChecklistItemInput)) body: ChecklistItemInput,
  ): Promise<OccurrenceDto> {
    return this.tasks.addChecklistItem(ctx, assertUuid(id), body);
  }

  /** Modifier ou cocher une sous-tâche. */
  @Patch('occurrences/:occurrenceId/checklist/:itemId')
  updateChecklistItem(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodPipe(UpdateChecklistItemInput)) body: UpdateChecklistItemInput,
  ): Promise<OccurrenceDto> {
    return this.tasks.updateChecklistItem(ctx, assertUuid(id), assertUuid(itemId), body);
  }

  /** Supprimer une sous-tâche. */
  @Delete('occurrences/:occurrenceId/checklist/:itemId')
  removeChecklistItem(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
    @Param('itemId') itemId: string,
  ): Promise<OccurrenceDto> {
    return this.tasks.removeChecklistItem(ctx, assertUuid(id), assertUuid(itemId));
  }

  /** Supprimer une occurrence (vers la corbeille). */
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

  /** Historique d'une série répétée (qui l'a faite, quand). */
  @Get('series/:seriesId/history')
  seriesHistory(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('seriesId') id: string,
  ): Promise<SeriesHistoryDto> {
    return this.tasks.seriesHistory(ctx, assertUuid(id));
  }

  /** Détail d'une série répétée. */
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

  /** Statistiques du foyer sur une période. */
  @Get('stats')
  stats(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(StatsQuery)) query: StatsQuery,
  ): Promise<StatsDto> {
    return this.tasks.stats(ctx, query);
  }

  /** Revue de la semaine : fait, glissé, et la semaine suivante. */
  @Get('review')
  review(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(WeeklyReviewQuery)) query: WeeklyReviewQuery,
  ): Promise<WeeklyReviewDto> {
    return this.reviews.weekly(ctx, query);
  }

  /** Répartition de la charge entre les membres. */
  @Get('balance')
  balance(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(BalanceQuery)) query: BalanceQuery,
  ): Promise<BalanceDto> {
    return this.tasks.balance(ctx, query);
  }
}
