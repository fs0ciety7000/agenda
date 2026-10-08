import { HttpStatus, Injectable } from '@nestjs/common';
import type { Note } from '@prisma/client';
import { MAX_NOTES, type NoteDto, type NoteInput, type UpdateNoteInput } from '@agenda/contracts';
import { AppException, notFound } from '../common/app-exception';
import { DomainEvents } from '../common/domain-events';
import { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const toDto = (n: Note): NoteDto => ({
  id: n.id,
  title: n.title,
  body: n.body,
  pinned: n.pinned,
  createdById: n.createdById,
  updatedById: n.updatedById,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
  version: n.version,
});

/**
 * Notes partagées du foyer (codes Wi-Fi, mesures, idées cadeaux) : chacun peut les lire, les
 * modifier et les supprimer. Deux modifications simultanées : la seconde reçoit 409 avec la
 * version actuelle, qu'elle affiche avant de réessayer.
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  /** Épinglées d'abord, puis les plus récemment modifiées. */
  async list(ctx: HouseholdContext): Promise<NoteDto[]> {
    const notes = await this.prisma.note.findMany({
      where: { householdId: ctx.householdId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
    return notes.map(toDto);
  }

  async create(ctx: HouseholdContext, input: NoteInput): Promise<NoteDto> {
    const count = await this.prisma.note.count({ where: { householdId: ctx.householdId } });
    if (count >= MAX_NOTES) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Too many notes',
      );
    }
    const note = await this.prisma.note.create({
      data: {
        householdId: ctx.householdId,
        title: input.title,
        body: input.body,
        pinned: input.pinned,
        createdById: ctx.memberId,
        updatedById: ctx.memberId,
      },
    });
    this.events.publish(ctx.householdId, 'notes');
    return toDto(note);
  }

  async update(ctx: HouseholdContext, id: string, input: UpdateNoteInput): Promise<NoteDto> {
    const { version, ...patch } = input;
    // Mise à jour conditionnelle : la version doit être celle que l'appelant a lue.
    const { count } = await this.prisma.note.updateMany({
      where: { id, householdId: ctx.householdId, version },
      data: { ...patch, updatedById: ctx.memberId, version: { increment: 1 } },
    });
    const note = await this.prisma.note.findFirst({ where: { id, householdId: ctx.householdId } });
    if (!note) throw notFound();
    if (!count) {
      throw new AppException('VERSION_CONFLICT', HttpStatus.CONFLICT, 'Note was modified', {
        current: toDto(note),
      });
    }
    this.events.publish(ctx.householdId, 'notes');
    return toDto(note);
  }

  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    const { count } = await this.prisma.note.deleteMany({
      where: { id, householdId: ctx.householdId },
    });
    if (!count) throw notFound();
    this.events.publish(ctx.householdId, 'notes');
  }
}
