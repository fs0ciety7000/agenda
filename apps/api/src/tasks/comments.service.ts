import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { CommentDto, CreateCommentInput } from '@agenda/contracts';
import { AppException, notFound } from '../common/app-exception';
import { DomainEvents } from '../common/domain-events';
import type { HouseholdContext } from '../common/request-context';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Garde-fou : une tâche ne garde que ses derniers commentaires affichés. */
const MAX_LISTED = 200;

/**
 * Commentaires sur une tâche (« le produit est sous l'évier »), communs à toutes ses occurrences.
 * Mêmes règles de visibilité que la tâche : ceux d'une tâche personnelle ne sont lus que par son
 * créateur. Un nouveau commentaire prévient (notification + temps réel) les responsables, le
 * créateur et ceux qui ont déjà commenté, jamais l'auteur.
 */
@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
    private readonly notifications: NotificationsService,
  ) {}

  async list(ctx: HouseholdContext, occurrenceId: string): Promise<CommentDto[]> {
    const occ = await this.occurrence(ctx, occurrenceId);
    const rows = await this.prisma.taskComment.findMany({
      where: { taskId: occ.taskId },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED,
    });
    return rows.reverse().map(toDto);
  }

  async create(
    ctx: HouseholdContext,
    occurrenceId: string,
    input: CreateCommentInput,
  ): Promise<CommentDto> {
    const occ = await this.occurrence(ctx, occurrenceId);
    const row = await this.prisma.taskComment.create({
      data: {
        householdId: ctx.householdId,
        taskId: occ.taskId,
        authorId: ctx.memberId,
        body: input.body,
      },
    });
    this.changed(ctx.householdId);
    if (occ.task.visibility === 'SHARED') {
      const previous = await this.prisma.taskComment.findMany({
        where: { taskId: occ.taskId, authorId: { not: null } },
        distinct: ['authorId'],
        select: { authorId: true },
      });
      const targets = [
        ...occ.assignees.map((a) => a.memberId),
        occ.task.createdById,
        ...previous.map((p) => p.authorId!),
      ];
      await this.notifications
        .notifyComment(ctx, occ.id, targets, occ.seriesId !== null)
        .catch((e: Error) => this.logger.warn(`Notification failed: ${e.message}`));
    }
    return toDto(row);
  }

  /** Seul l'auteur supprime son commentaire. */
  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    const row = await this.prisma.taskComment.findFirst({
      where: { id, householdId: ctx.householdId },
      select: { authorId: true, taskId: true },
    });
    if (!row) throw notFound();
    if (row.authorId !== ctx.memberId)
      throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN, 'Only the author can delete');
    await this.prisma.taskComment.delete({ where: { id } });
    this.changed(ctx.householdId);
  }

  private changed(householdId: string) {
    this.events.publish(householdId, 'comments');
    // Nombre de commentaires affiché dans les listes.
    this.events.publish(householdId, 'tasks');
  }

  private async occurrence(ctx: HouseholdContext, id: string) {
    const occ = await this.prisma.taskOccurrence.findFirst({
      where: {
        id,
        householdId: ctx.householdId,
        task: { deletedAt: null, OR: [{ visibility: 'SHARED' }, { createdById: ctx.memberId }] },
      },
      select: {
        id: true,
        taskId: true,
        seriesId: true,
        assignees: { select: { memberId: true } },
        task: { select: { visibility: true, createdById: true } },
      },
    });
    if (!occ) throw notFound();
    return occ;
  }
}

const toDto = (c: {
  id: string;
  authorId: string | null;
  body: string;
  createdAt: Date;
}): CommentDto => ({
  id: c.id,
  authorId: c.authorId,
  body: c.body,
  createdAt: c.createdAt.toISOString(),
});
