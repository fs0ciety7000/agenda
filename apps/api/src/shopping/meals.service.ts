import { HttpStatus, Injectable } from '@nestjs/common';
import type { Meal } from '@prisma/client';
import type {
  MealDto,
  MealInput,
  MealsQuery,
  MealsToShoppingDto,
  MealSuggestionDto,
  UpdateMealInput,
} from '@agenda/contracts';
import { addDays, parseShoppingText, productKey } from '@agenda/domain';
import { AppException, notFound } from '../common/app-exception';
import { fromDbDate, toDbDate } from '../common/dates';
import { DomainEvents } from '../common/domain-events';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { ShoppingService } from './shopping.service';

const MAX_RANGE_DAYS = 62;
const SUGGESTIONS = 20;

const toDto = (m: Meal): MealDto => ({
  id: m.id,
  date: fromDbDate(m.date)!,
  slot: m.slot,
  title: m.title,
  ingredients: m.ingredients,
  addedToShoppingAt: m.addedToShoppingAt?.toISOString() ?? null,
});

/**
 * Menus de la semaine. Les ingrédients d'un ou plusieurs repas partent dans la liste de courses
 * en un geste, sans doublon avec ce qui y est déjà (non coché).
 */
@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopping: ShoppingService,
    private readonly events: DomainEvents,
  ) {}

  async list(ctx: HouseholdContext, q: MealsQuery): Promise<MealDto[]> {
    if (q.to > addDays(q.from, MAX_RANGE_DAYS)) {
      throw new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Range too long');
    }
    const meals = await this.prisma.meal.findMany({
      where: { householdId: ctx.householdId, date: { gte: toDbDate(q.from), lte: toDbDate(q.to) } },
      orderBy: [{ date: 'asc' }, { slot: 'asc' }, { createdAt: 'asc' }],
    });
    return meals.map(toDto);
  }

  async create(ctx: HouseholdContext, input: MealInput): Promise<MealDto> {
    const meal = await this.prisma.meal.create({
      data: {
        householdId: ctx.householdId,
        date: toDbDate(input.date),
        slot: input.slot,
        title: input.title,
        ingredients: input.ingredients,
        createdById: ctx.memberId,
      },
    });
    this.events.publish(ctx.householdId, 'meals');
    return toDto(meal);
  }

  async update(ctx: HouseholdContext, id: string, input: UpdateMealInput): Promise<MealDto> {
    await this.find(ctx, id);
    const meal = await this.prisma.meal.update({
      where: { id },
      data: {
        ...(input.date ? { date: toDbDate(input.date) } : {}),
        ...(input.slot ? { slot: input.slot } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.ingredients ? { ingredients: input.ingredients } : {}),
      },
    });
    this.events.publish(ctx.householdId, 'meals');
    return toDto(meal);
  }

  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    await this.find(ctx, id);
    await this.prisma.meal.delete({ where: { id } });
    this.events.publish(ctx.householdId, 'meals');
  }

  /** Ingrédients → liste de courses ; ce qui est déjà à acheter n'est pas ajouté deux fois. */
  async toShopping(ctx: HouseholdContext, mealIds: string[]): Promise<MealsToShoppingDto> {
    const meals = await this.prisma.meal.findMany({
      where: { id: { in: mealIds }, householdId: ctx.householdId },
      orderBy: [{ date: 'asc' }, { slot: 'asc' }],
    });
    if (!meals.length) throw notFound();
    const open = await this.prisma.shoppingItem.findMany({
      where: { householdId: ctx.householdId, done: false },
      select: { text: true },
    });
    const seen = new Set(open.map((i) => productKey(i.text)));
    let added = 0;
    let skipped = 0;
    for (const text of meals.flatMap((m) => m.ingredients)) {
      const key = productKey(parseShoppingText(text).name);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      await this.shopping.add(ctx, { text });
      added += 1;
    }
    await this.prisma.meal.updateMany({
      where: { id: { in: meals.map((m) => m.id) } },
      data: { addedToShoppingAt: new Date() },
    });
    this.events.publish(ctx.householdId, 'meals');
    return { added, skipped };
  }

  /** Repas déjà faits (90 derniers jours), les plus fréquents d'abord. */
  async suggestions(ctx: HouseholdContext): Promise<MealSuggestionDto[]> {
    const since = new Date(Date.now() - 90 * 86_400_000);
    const meals = await this.prisma.meal.findMany({
      where: { householdId: ctx.householdId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { title: true, ingredients: true },
    });
    const byTitle = new Map<string, MealSuggestionDto>();
    for (const m of meals) {
      const key = m.title.trim().toLowerCase();
      const entry = byTitle.get(key);
      if (entry) entry.times += 1;
      else byTitle.set(key, { title: m.title, ingredients: m.ingredients, times: 1 });
    }
    return [...byTitle.values()].sort((a, b) => b.times - a.times).slice(0, SUGGESTIONS);
  }

  private async find(ctx: HouseholdContext, id: string) {
    const meal = await this.prisma.meal.findFirst({ where: { id, householdId: ctx.householdId } });
    if (!meal) throw notFound();
    return meal;
  }
}
