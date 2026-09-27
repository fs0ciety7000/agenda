import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type CommentDto, CreateCommentInput } from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { CommentsService } from './comments.service';

@ApiTags('comments')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId', version: '1' })
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /** Commentaires d'une tâche. */
  @Get('occurrences/:occurrenceId/comments')
  list(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
  ): Promise<CommentDto[]> {
    return this.comments.list(ctx, assertUuid(id));
  }

  /** Commenter une tâche. */
  @Post('occurrences/:occurrenceId/comments')
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') id: string,
    @Body(new ZodPipe(CreateCommentInput)) input: CreateCommentInput,
  ): Promise<CommentDto> {
    return this.comments.create(ctx, assertUuid(id), input);
  }

  /** Supprimer son commentaire. */
  @Delete('comments/:id')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('id') id: string): Promise<void> {
    return this.comments.remove(ctx, assertUuid(id));
  }
}
