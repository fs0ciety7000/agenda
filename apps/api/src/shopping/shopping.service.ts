import { HttpStatus, Injectable } from '@nestjs/common';
import type { ShoppingItem } from '@prisma/client';
import {
  MAX_SHOPPING_ITEMS,
  type ShoppingItemDto,
  type ShoppingItemInput,
  type UpdateShoppingItemInput,
} from '@agenda/contracts';
import { randomUUID } from 'node:crypto';
import { AppException, notFound } from '../common/app-exception';
import { DomainEvents } from '../common/domain-events';
import { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const toDto = (i: ShoppingItem): ShoppingItemDto => ({
  id: i.id,
  text: i.text,
  done: i.done,
  createdById: i.createdById,
  doneById: i.doneById,
  createdAt: i.createdAt.toISOString(),
  doneAt: i.doneAt?.toISOString() ?? null,
});

/** Liste de courses permanente du foyer, partagée et mise à jour en temps réel. */
@Injectable()
export class ShoppingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  /** À acheter (dans l'ordre d'ajout), puis déjà pris (les plus récents d'abord). */
  async list(ctx: HouseholdContext): Promise<ShoppingItemDto[]> {
    const items = await this.prisma.shoppingItem.findMany({
      where: { householdId: ctx.householdId },
      orderBy: [{ done: 'asc' }, { doneAt: 'desc' }, { createdAt: 'asc' }],
    });
    return items.map(toDto);
  }

  async add(ctx: HouseholdContext, input: ShoppingItemInput): Promise<ShoppingItemDto> {
    if (input.id) {
      // Ajout rejoué (hors ligne) : on renvoie l'article déjà créé.
      const existing = await this.prisma.shoppingItem.findUnique({ where: { id: input.id } });
      if (existing) {
        if (existing.householdId !== ctx.householdId) throw notFound();
        return toDto(existing);
      }
    }
    const count = await this.prisma.shoppingItem.count({ where: { householdId: ctx.householdId } });
    if (count >= MAX_SHOPPING_ITEMS) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Too many items',
      );
    }
    const item = await this.prisma.shoppingItem.create({
      data: {
        id: input.id ?? randomUUID(),
        householdId: ctx.householdId,
        text: input.text,
        createdById: ctx.memberId,
      },
    });
    this.events.publish(ctx.householdId, 'shopping');
    return toDto(item);
  }

  async update(
    ctx: HouseholdContext,
    id: string,
    input: UpdateShoppingItemInput,
  ): Promise<ShoppingItemDto> {
    const current = await this.find(ctx, id);
    const doneChanged = input.done !== undefined && input.done !== current.done;
    const item = await this.prisma.shoppingItem.update({
      where: { id },
      data: {
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(doneChanged
          ? input.done
            ? { done: true, doneById: ctx.memberId, doneAt: new Date() }
            : { done: false, doneById: null, doneAt: null }
          : {}),
      },
    });
    this.events.publish(ctx.householdId, 'shopping');
    return toDto(item);
  }

  /** Idempotent : un article déjà retiré (par l'autre) ne provoque pas d'erreur. */
  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    const { count } = await this.prisma.shoppingItem.deleteMany({
      where: { id, householdId: ctx.householdId },
    });
    if (count) this.events.publish(ctx.householdId, 'shopping');
  }

  /** « Vider le panier » : retire les articles cochés. */
  async clearDone(ctx: HouseholdContext): Promise<void> {
    const { count } = await this.prisma.shoppingItem.deleteMany({
      where: { householdId: ctx.householdId, done: true },
    });
    if (count) this.events.publish(ctx.householdId, 'shopping');
  }

  private async find(ctx: HouseholdContext, id: string) {
    const item = await this.prisma.shoppingItem.findFirst({
      where: { id, householdId: ctx.householdId },
    });
    if (!item) throw notFound();
    return item;
  }
}
