import { HttpStatus, Injectable } from '@nestjs/common';
import type { SwapRequest } from '@prisma/client';
import type { SwapDto, SwapListDto, SwapRequestInput } from '@agenda/contracts';
import { AppException, notFound } from '../common/app-exception';
import { fromDbDate } from '../common/dates';
import { DomainEvents } from '../common/domain-events';
import type { HouseholdContext } from '../common/request-context';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

const invalid = (field: string, message: string) =>
  new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, message, {
    fieldErrors: { [field]: [message] },
  });

type SwapRow = SwapRequest & {
  occurrence: { date: Date | null; titleOverride: string | null; task: { title: string } };
};

const toDto = (s: SwapRow): SwapDto => ({
  id: s.id,
  occurrenceId: s.occurrenceId,
  title: s.occurrence.titleOverride ?? s.occurrence.task.title,
  date: fromDbDate(s.occurrence.date),
  fromMemberId: s.fromMemberId,
  toMemberId: s.toMemberId,
  note: s.note,
  status: s.status,
  createdAt: s.createdAt.toISOString(),
});

const INCLUDE = {
  occurrence: { select: { date: true, titleOverride: true, task: { select: { title: true } } } },
} as const;

/**
 * Échange de tour : une personne responsable d'une tâche (à faire, partagée) la propose à un
 * autre membre. Accepter remplace la première par la seconde parmi les responsables, comme une
 * modification ordinaire (synchronisation, temps réel, journal) ; refuser prévient seulement.
 */
@Injectable()
export class SwapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly notifications: NotificationsService,
    private readonly events: DomainEvents,
  ) {}

  async list(ctx: HouseholdContext): Promise<SwapListDto> {
    const rows = await this.prisma.swapRequest.findMany({
      where: {
        householdId: ctx.householdId,
        status: 'PENDING',
        OR: [{ toMemberId: ctx.memberId }, { fromMemberId: ctx.memberId }],
      },
      include: INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return {
      incoming: rows.filter((r) => r.toMemberId === ctx.memberId).map(toDto),
      outgoing: rows.filter((r) => r.fromMemberId === ctx.memberId).map(toDto),
    };
  }

  async request(
    ctx: HouseholdContext,
    occurrenceId: string,
    input: SwapRequestInput,
  ): Promise<SwapDto> {
    const o = await this.tasks.get(ctx, occurrenceId);
    if (!o.assigneeIds.includes(ctx.memberId)) {
      throw invalid('occurrenceId', 'Only an assignee can ask for a swap');
    }
    if (o.status !== 'TODO') throw invalid('occurrenceId', 'Only a task to do can be swapped');
    if (o.visibility === 'PERSONAL') {
      throw invalid('occurrenceId', 'A personal task cannot be swapped');
    }
    if (input.toMemberId === ctx.memberId || o.assigneeIds.includes(input.toMemberId)) {
      throw invalid('toMemberId', 'Pick someone who is not already on this task');
    }
    const target = await this.prisma.householdMember.findFirst({
      where: { id: input.toMemberId, householdId: ctx.householdId, leftAt: null },
      select: { id: true },
    });
    if (!target) throw invalid('toMemberId', 'Unknown member');
    // Une seule demande en attente par tâche : la nouvelle remplace l'ancienne.
    await this.prisma.swapRequest.updateMany({
      where: { occurrenceId, status: 'PENDING' },
      data: { status: 'CANCELLED', answeredAt: new Date() },
    });
    const swap = await this.prisma.swapRequest.create({
      data: {
        householdId: ctx.householdId,
        occurrenceId,
        fromMemberId: ctx.memberId,
        toMemberId: input.toMemberId,
        note: input.note || null,
      },
      include: INCLUDE,
    });
    await this.notifications.notifySwapRequest(ctx, occurrenceId, input.toMemberId, o.isRecurring);
    this.events.publish(ctx.householdId, 'tasks');
    return toDto(swap);
  }

  /** Répondre à une demande reçue : accepter (la tâche me revient) ou refuser. */
  async answer(ctx: HouseholdContext, id: string, accept: boolean): Promise<SwapDto> {
    const swap = await this.pending(ctx, id);
    if (swap.toMemberId !== ctx.memberId) throw notFound();
    if (accept) {
      const o = await this.tasks.get(ctx, swap.occurrenceId);
      if (o.status !== 'TODO' || !o.assigneeIds.includes(swap.fromMemberId)) {
        // La tâche a changé entre-temps (faite, réattribuée) : la demande n'a plus d'objet.
        await this.close(id, 'CANCELLED');
        throw new AppException(
          'VERSION_CONFLICT',
          HttpStatus.CONFLICT,
          'The task changed meanwhile',
        );
      }
      const assigneeIds = [
        ...new Set(o.assigneeIds.map((m) => (m === swap.fromMemberId ? ctx.memberId : m))),
      ];
      await this.tasks.update(ctx, o.id, { assigneeIds, version: o.version }, 'this');
    }
    const closed = await this.close(id, accept ? 'ACCEPTED' : 'DECLINED');
    const recurring = (await this.tasks.get(ctx, swap.occurrenceId)).isRecurring;
    await this.notifications.notifySwapAnswer(
      ctx,
      swap.occurrenceId,
      swap.fromMemberId,
      recurring,
      accept,
    );
    // Accepter a déjà signalé la modification de la tâche ; refuser change seulement la demande.
    if (!accept) this.events.publish(ctx.householdId, 'tasks');
    return toDto(closed);
  }

  /** Retirer une demande envoyée, tant qu'elle attend une réponse. */
  async cancel(ctx: HouseholdContext, id: string): Promise<void> {
    const swap = await this.pending(ctx, id);
    if (swap.fromMemberId !== ctx.memberId) throw notFound();
    await this.close(id, 'CANCELLED');
    this.events.publish(ctx.householdId, 'tasks');
  }

  private async pending(ctx: HouseholdContext, id: string) {
    const swap = await this.prisma.swapRequest.findFirst({
      where: { id, householdId: ctx.householdId, status: 'PENDING' },
    });
    if (!swap) throw notFound();
    return swap;
  }

  private close(id: string, status: 'ACCEPTED' | 'DECLINED' | 'CANCELLED') {
    return this.prisma.swapRequest.update({
      where: { id },
      data: { status, answeredAt: new Date() },
      include: INCLUDE,
    });
  }
}
