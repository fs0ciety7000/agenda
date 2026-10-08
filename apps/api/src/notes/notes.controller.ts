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
import { type NoteDto, NoteInput, UpdateNoteInput } from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { NotesService } from './notes.service';

@ApiTags('notes')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/notes', version: '1' })
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  /** Notes partagées du foyer (épinglées d'abord). */
  @Get()
  list(@CurrentHousehold() ctx: HouseholdContext): Promise<NoteDto[]> {
    return this.notes.list(ctx);
  }

  /** Ajouter une note. */
  @Post()
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(NoteInput)) body: NoteInput,
  ): Promise<NoteDto> {
    return this.notes.create(ctx, body);
  }

  /** Modifier ou épingler une note (409 si elle a changé entre-temps). */
  @Patch(':noteId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('noteId') id: string,
    @Body(new ZodPipe(UpdateNoteInput)) body: UpdateNoteInput,
  ): Promise<NoteDto> {
    return this.notes.update(ctx, assertUuid(id), body);
  }

  /** Supprimer une note. */
  @Delete(':noteId')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('noteId') id: string): Promise<void> {
    return this.notes.remove(ctx, assertUuid(id));
  }
}
