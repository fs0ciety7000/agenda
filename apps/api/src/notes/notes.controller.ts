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
  type NoteDto,
  NoteInput,
  type NoteRevisionDto,
  type RevealedNoteDto,
  RevealNoteInput,
  RestoreNoteRevisionInput,
  UpdateNoteInput,
} from '@agenda/contracts';
import { Throttle } from '@nestjs/throttler';
import {
  AuthUser,
  CurrentHousehold,
  CurrentUser,
  HouseholdContext,
} from '../common/request-context';
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

  /**
   * Afficher le contenu d'une note sensible (mot de passe ou confirmation sur le site, coffre
   * ouvert 5 minutes ensuite ; vérifié sur l'appareil pour Android).
   */
  @Post(':noteId/reveal')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reveal(
    @CurrentHousehold() ctx: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Param('noteId') id: string,
    @Body(new ZodPipe(RevealNoteInput)) body: RevealNoteInput,
  ): Promise<RevealedNoteDto> {
    return this.notes.reveal(ctx, user, assertUuid(id), body);
  }

  /** Versions précédentes d'une note (20 au plus), de la plus récente à la plus ancienne. */
  @Get(':noteId/revisions')
  revisions(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('noteId') id: string,
  ): Promise<NoteRevisionDto[]> {
    return this.notes.revisions(ctx, assertUuid(id));
  }

  /** Restaurer une version précédente (409 si la note a changé entre-temps). */
  @Post(':noteId/revisions/:revisionId/restore')
  @HttpCode(200)
  restore(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('noteId') id: string,
    @Param('revisionId') revisionId: string,
    @Body(new ZodPipe(RestoreNoteRevisionInput)) body: RestoreNoteRevisionInput,
  ): Promise<NoteDto> {
    return this.notes.restore(ctx, assertUuid(id), assertUuid(revisionId), body.version);
  }

  /** Supprimer une note. */
  @Delete(':noteId')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('noteId') id: string): Promise<void> {
    return this.notes.remove(ctx, assertUuid(id));
  }
}
