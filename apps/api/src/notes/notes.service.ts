import { HttpStatus, Injectable } from '@nestjs/common';
import type { Note, NoteRevision } from '@prisma/client';
import {
  MAX_NOTE_REVISIONS,
  MAX_NOTES,
  type NoteDto,
  type NoteInput,
  type NoteRevisionDto,
  type UpdateNoteInput,
} from '@agenda/contracts';
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

const toRevisionDto = (r: NoteRevision): NoteRevisionDto => ({
  id: r.id,
  title: r.title,
  body: r.body,
  version: r.version,
  editedById: r.editedById,
  savedAt: r.savedAt.toISOString(),
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
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.note.findFirst({ where: { id, householdId: ctx.householdId } });
      if (!before) throw notFound();
      // Mise à jour conditionnelle : la version doit être celle que l'appelant a lue. Une
      // modification simultanée attend le verrou de la ligne, puis ne trouve plus sa version.
      const { count } = await tx.note.updateMany({
        where: { id, householdId: ctx.householdId, version },
        data: { ...patch, updatedById: ctx.memberId, version: { increment: 1 } },
      });
      if (!count) return null;
      // Titre ou texte changés : l'ancien contenu rejoint l'historique (pas pour une épingle).
      const changed =
        (patch.title !== undefined && patch.title !== before.title) ||
        (patch.body !== undefined && patch.body !== before.body);
      if (changed) {
        await tx.noteRevision.create({
          data: {
            noteId: id,
            title: before.title,
            body: before.body,
            version: before.version,
            editedById: before.updatedById,
            savedAt: before.updatedAt,
          },
        });
        const old = await tx.noteRevision.findMany({
          where: { noteId: id },
          orderBy: { version: 'desc' },
          skip: MAX_NOTE_REVISIONS,
          select: { id: true },
        });
        if (old.length) {
          await tx.noteRevision.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
        }
      }
      return tx.note.findUniqueOrThrow({ where: { id } });
    });
    if (!updated) {
      const current = await this.prisma.note.findFirst({
        where: { id, householdId: ctx.householdId },
      });
      if (!current) throw notFound();
      throw new AppException('VERSION_CONFLICT', HttpStatus.CONFLICT, 'Note was modified', {
        current: toDto(current),
      });
    }
    this.events.publish(ctx.householdId, 'notes');
    return toDto(updated);
  }

  /** Versions précédentes d'une note, de la plus récente à la plus ancienne. */
  async revisions(ctx: HouseholdContext, id: string): Promise<NoteRevisionDto[]> {
    await this.find(ctx, id);
    const revisions = await this.prisma.noteRevision.findMany({
      where: { noteId: id },
      orderBy: { version: 'desc' },
    });
    return revisions.map(toRevisionDto);
  }

  /**
   * Restaure une version : c'est une modification comme une autre (même contrôle de version), le
   * contenu remplacé rejoint donc l'historique et rien n'est perdu.
   */
  async restore(
    ctx: HouseholdContext,
    id: string,
    revisionId: string,
    version: number,
  ): Promise<NoteDto> {
    await this.find(ctx, id);
    const revision = await this.prisma.noteRevision.findFirst({
      where: { id: revisionId, noteId: id },
    });
    if (!revision) throw notFound();
    return this.update(ctx, id, { title: revision.title, body: revision.body, version });
  }

  private async find(ctx: HouseholdContext, id: string): Promise<Note> {
    const note = await this.prisma.note.findFirst({ where: { id, householdId: ctx.householdId } });
    if (!note) throw notFound();
    return note;
  }

  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    const { count } = await this.prisma.note.deleteMany({
      where: { id, householdId: ctx.householdId },
    });
    if (!count) throw notFound();
    this.events.publish(ctx.householdId, 'notes');
  }
}
