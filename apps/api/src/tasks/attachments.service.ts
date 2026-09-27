import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ATTACHMENT_MAX_BYTES,
  HOUSEHOLD_ATTACHMENTS_MAX_BYTES,
  type AttachmentDto,
} from '@agenda/contracts';
import { AppException, notFound } from '../common/app-exception';
import { DomainEvents } from '../common/domain-events';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

export interface IncomingFile {
  filename: string;
  contentType: string;
  data: Buffer;
}

/** Types affichés dans le navigateur ; tout le reste est téléchargé (jamais interprété). */
const INLINE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

/** Nom de fichier sûr (sans chemin ni caractères de contrôle). */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (clean || 'fichier').slice(0, 255);
}

const safeContentType = (t: string) =>
  /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(t)
    ? t.toLowerCase().slice(0, 127)
    : 'application/octet-stream';

/**
 * Pièces jointes des tâches (factures, photos…), stockées en base. Visibles comme la tâche :
 * celles d'une tâche personnelle ne le sont que par son créateur.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  private async visibleTask(ctx: HouseholdContext, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        householdId: ctx.householdId,
        deletedAt: null,
        OR: [{ visibility: 'SHARED' }, { createdById: ctx.memberId }],
      },
      select: { id: true, title: true, visibility: true },
    });
    if (!task) throw notFound();
    return task;
  }

  async taskOfOccurrence(ctx: HouseholdContext, occurrenceId: string): Promise<string> {
    const o = await this.prisma.taskOccurrence.findFirst({
      where: { id: occurrenceId, householdId: ctx.householdId },
      select: { taskId: true },
    });
    if (!o) throw notFound();
    return (await this.visibleTask(ctx, o.taskId)).id;
  }

  async add(
    ctx: HouseholdContext,
    taskId: string,
    files: IncomingFile[],
  ): Promise<AttachmentDto[]> {
    const task = await this.visibleTask(ctx, taskId);
    if (files.some((f) => f.data.length > ATTACHMENT_MAX_BYTES)) {
      throw new AppException(
        'ATTACHMENT_TOO_LARGE',
        HttpStatus.PAYLOAD_TOO_LARGE,
        'File too large',
      );
    }
    const used = await this.prisma.taskAttachment.aggregate({
      where: { householdId: ctx.householdId },
      _sum: { size: true },
    });
    const incoming = files.reduce((n, f) => n + f.data.length, 0);
    if ((used._sum.size ?? 0) + incoming > HOUSEHOLD_ATTACHMENTS_MAX_BYTES) {
      throw new AppException('ATTACHMENTS_QUOTA', HttpStatus.PAYLOAD_TOO_LARGE, 'Quota exceeded');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const f of files) {
        rows.push(
          await tx.taskAttachment.create({
            data: {
              householdId: ctx.householdId,
              taskId: task.id,
              filename: safeFilename(f.filename),
              contentType: safeContentType(f.contentType),
              size: f.data.length,
              data: new Uint8Array(f.data),
              createdById: ctx.memberId,
            },
            select: { id: true, filename: true, contentType: true, size: true },
          }),
        );
      }
      await tx.activityLog.create({
        data: {
          householdId: ctx.householdId,
          actorId: ctx.memberId,
          action: 'attachment.added',
          entityType: 'Task',
          entityId: task.id,
          title: task.title,
          personal: task.visibility === 'PERSONAL',
          data: { files: rows.map((r) => r.filename) },
        },
      });
      return rows;
    });
    this.events.householdChanged(ctx.householdId);
    return created;
  }

  async get(ctx: HouseholdContext, id: string) {
    const a = await this.prisma.taskAttachment.findFirst({
      where: { id, householdId: ctx.householdId },
    });
    if (!a) throw notFound();
    await this.visibleTask(ctx, a.taskId);
    return {
      filename: a.filename,
      contentType: a.contentType,
      data: Buffer.from(a.data),
      inline: INLINE_TYPES.has(a.contentType),
    };
  }

  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    const a = await this.prisma.taskAttachment.findFirst({
      where: { id, householdId: ctx.householdId },
      select: { id: true, taskId: true, filename: true },
    });
    if (!a) throw notFound();
    const task = await this.visibleTask(ctx, a.taskId);
    await this.prisma.$transaction([
      this.prisma.taskAttachment.delete({ where: { id: a.id } }),
      this.prisma.activityLog.create({
        data: {
          householdId: ctx.householdId,
          actorId: ctx.memberId,
          action: 'attachment.deleted',
          entityType: 'Task',
          entityId: task.id,
          title: task.title,
          personal: task.visibility === 'PERSONAL',
          data: { files: [a.filename] },
        },
      }),
    ]);
    this.events.householdChanged(ctx.householdId);
  }
}
