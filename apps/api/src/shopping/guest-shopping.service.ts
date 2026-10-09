import { Injectable } from '@nestjs/common';
import type { Aisle, GuestShoppingDto, GuestShoppingLinkDto } from '@agenda/contracts';
import { AISLES, guessAisle } from '@agenda/domain';
import { randomBytes } from 'node:crypto';
import { notFound } from '../common/app-exception';
import { DomainEvents } from '../common/domain-events';
import type { HouseholdContext } from '../common/request-context';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const guestUrl = (token: string) => `${env().WEB_ORIGIN.replace(/\/+$/, '')}/guest/${token}`;

const asAisle = (v: string | null, text: string): Aisle =>
  v && (AISLES as readonly string[]).includes(v) ? (v as Aisle) : guessAisle(text);

/**
 * Lien invité vers la liste de courses (baby-sitter, quelqu'un qui garde la maison) : lecture
 * seule, sans compte. Un seul lien par foyer, que chaque membre peut créer, remplacer ou couper.
 * L'invité ne voit que les articles : ni les membres, ni les tâches, ni le reste du foyer.
 */
@Injectable()
export class GuestShoppingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  async link(ctx: HouseholdContext): Promise<GuestShoppingLinkDto> {
    const h = await this.prisma.household.findUniqueOrThrow({
      where: { id: ctx.householdId },
      select: {
        guestShoppingToken: true,
        guestShoppingCreatedAt: true,
        guestShoppingCreatedById: true,
      },
    });
    if (!h.guestShoppingToken) return { url: null, createdAt: null, createdById: null };
    return {
      url: guestUrl(h.guestShoppingToken),
      createdAt: h.guestShoppingCreatedAt?.toISOString() ?? null,
      createdById: h.guestShoppingCreatedById,
    };
  }

  /** Crée le lien, ou le remplace (l'ancien cesse de fonctionner aussitôt). */
  async regenerate(ctx: HouseholdContext): Promise<GuestShoppingLinkDto> {
    await this.prisma.household.update({
      where: { id: ctx.householdId },
      data: {
        guestShoppingToken: randomBytes(20).toString('hex'),
        guestShoppingCreatedAt: new Date(),
        guestShoppingCreatedById: ctx.memberId,
      },
    });
    this.events.publish(ctx.householdId, 'shopping');
    return this.link(ctx);
  }

  async revoke(ctx: HouseholdContext): Promise<void> {
    await this.prisma.household.update({
      where: { id: ctx.householdId },
      data: {
        guestShoppingToken: null,
        guestShoppingCreatedAt: null,
        guestShoppingCreatedById: null,
      },
    });
    this.events.publish(ctx.householdId, 'shopping');
  }

  /** Liste vue par l'invité ; introuvable si le jeton est inconnu, coupé ou le foyer supprimé. */
  async view(token: string): Promise<GuestShoppingDto> {
    if (!/^[a-f0-9]{40}$/.test(token)) throw notFound();
    const household = await this.prisma.household.findFirst({
      where: { guestShoppingToken: token, deletedAt: null },
      select: {
        name: true,
        shoppingItems: {
          orderBy: [{ done: 'asc' }, { doneAt: 'desc' }, { createdAt: 'asc' }],
          select: { id: true, text: true, quantity: true, aisle: true, done: true },
        },
      },
    });
    if (!household) throw notFound();
    return {
      householdName: household.name,
      items: household.shoppingItems.map((i) => ({
        id: i.id,
        text: i.text,
        quantity: i.quantity,
        aisle: asAisle(i.aisle, i.text),
        done: i.done,
      })),
    };
  }
}
