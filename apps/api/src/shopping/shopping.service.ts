import { HttpStatus, Injectable } from '@nestjs/common';
import type { ShoppingItem } from '@prisma/client';
import {
  type Aisle,
  MAX_SHOPPING_ITEMS,
  type ShoppingItemDto,
  type ShoppingItemInput,
  type ShoppingSuggestionDto,
  type UpdateShoppingItemInput,
} from '@agenda/contracts';
import { AISLES, guessAisle, parseShoppingText, productKey } from '@agenda/domain';
import { randomUUID } from 'node:crypto';
import { AppException, notFound } from '../common/app-exception';
import { DomainEvents } from '../common/domain-events';
import { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const asAisle = (v: string | null | undefined): Aisle | null =>
  v && (AISLES as readonly string[]).includes(v) ? (v as Aisle) : null;

const toDto = (i: ShoppingItem): ShoppingItemDto => ({
  id: i.id,
  text: i.text,
  quantity: i.quantity,
  // Articles d'avant les rayons : deviné à la lecture.
  aisle: asAisle(i.aisle) ?? guessAisle(i.text),
  done: i.done,
  createdById: i.createdById,
  doneById: i.doneById,
  createdAt: i.createdAt.toISOString(),
  doneAt: i.doneAt?.toISOString() ?? null,
});

/** Nombre de suggestions « souvent achetés ». */
const SUGGESTIONS = 12;

/**
 * Liste de courses permanente du foyer, partagée et mise à jour en temps réel. Chaque article a
 * une quantité (« 2 kg ») et un rayon ; le foyer garde la mémoire de ses produits (rayon corrigé,
 * nombre d'achats) pour trier la liste et proposer ce qui est souvent acheté.
 */
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
    const parsed =
      input.quantity === undefined
        ? parseShoppingText(input.text)
        : { name: input.text, quantity: input.quantity || null };
    const key = productKey(parsed.name);
    const known = await this.prisma.shoppingProduct.findUnique({
      where: { householdId_key: { householdId: ctx.householdId, key } },
      select: { aisle: true },
    });
    const aisle = input.aisle ?? asAisle(known?.aisle) ?? guessAisle(parsed.name);
    const item = await this.prisma.shoppingItem.create({
      data: {
        id: input.id ?? randomUUID(),
        householdId: ctx.householdId,
        text: parsed.name,
        quantity: parsed.quantity,
        aisle,
        createdById: ctx.memberId,
      },
    });
    await this.remember(ctx.householdId, parsed.name, aisle, { added: true });
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
    // Texte modifié sans quantité explicite : « 3 citrons » est redécoupé.
    const parsed =
      input.text !== undefined && input.quantity === undefined
        ? parseShoppingText(input.text)
        : null;
    const item = await this.prisma.shoppingItem.update({
      where: { id },
      data: {
        ...(parsed
          ? { text: parsed.name, ...(parsed.quantity ? { quantity: parsed.quantity } : {}) }
          : {}),
        ...(input.text !== undefined && !parsed ? { text: input.text } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity || null } : {}),
        ...(input.aisle !== undefined ? { aisle: input.aisle } : {}),
        ...(doneChanged
          ? input.done
            ? { done: true, doneById: ctx.memberId, doneAt: new Date() }
            : { done: false, doneById: null, doneAt: null }
          : {}),
      },
    });
    const aisle = asAisle(item.aisle) ?? guessAisle(item.text);
    // Rayon corrigé : retenu pour la prochaine fois. Coché : un achat de plus.
    if (input.aisle !== undefined || (doneChanged && input.done)) {
      await this.remember(ctx.householdId, item.text, aisle, {
        aisleChosen: input.aisle !== undefined,
        bought: doneChanged && input.done === true,
      });
    }
    this.events.publish(ctx.householdId, 'shopping');
    return toDto(item);
  }

  /** Souvent achetés et absents de la liste (à acheter), les plus fréquents d'abord. */
  async suggestions(ctx: HouseholdContext): Promise<ShoppingSuggestionDto[]> {
    const [products, pending] = await Promise.all([
      this.prisma.shoppingProduct.findMany({
        where: { householdId: ctx.householdId, timesBought: { gt: 0 } },
        orderBy: [{ timesBought: 'desc' }, { lastBoughtAt: 'desc' }],
        take: SUGGESTIONS * 3,
      }),
      this.prisma.shoppingItem.findMany({
        where: { householdId: ctx.householdId, done: false },
        select: { text: true },
      }),
    ]);
    const onList = new Set(pending.map((i) => productKey(i.text)));
    return products
      .filter((p) => !onList.has(p.key))
      .slice(0, SUGGESTIONS)
      .map((p) => ({
        text: p.label,
        aisle: asAisle(p.aisle) ?? 'OTHER',
        timesBought: p.timesBought,
      }));
  }

  private async remember(
    householdId: string,
    name: string,
    aisle: Aisle,
    what: { added?: boolean; aisleChosen?: boolean; bought?: boolean },
  ) {
    const key = productKey(name);
    if (!key) return;
    const now = new Date();
    await this.prisma.shoppingProduct.upsert({
      where: { householdId_key: { householdId, key } },
      create: {
        householdId,
        key,
        label: name.slice(0, 200),
        aisle,
        timesBought: what.bought ? 1 : 0,
        lastBoughtAt: what.bought ? now : null,
      },
      update: {
        ...(what.added ? { label: name.slice(0, 200), lastAddedAt: now } : {}),
        ...(what.aisleChosen ? { aisle } : {}),
        ...(what.bought ? { timesBought: { increment: 1 }, lastBoughtAt: now } : {}),
      },
    });
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
