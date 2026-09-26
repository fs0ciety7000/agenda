import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CategoryDto, CategoryInput, UpdateCategoryInput } from '@agenda/contracts';
import { AppException, notFound } from '../common/app-exception';
import { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const toDto = ({
  id,
  name,
  emoji,
  position,
}: {
  id: string;
  name: string;
  emoji: string | null;
  position: number;
}) => ({
  id,
  name,
  emoji,
  position,
});

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: HouseholdContext): Promise<CategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      where: { householdId: ctx.householdId, deletedAt: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return categories.map(toDto);
  }

  async create(ctx: HouseholdContext, input: CategoryInput): Promise<CategoryDto> {
    const last = await this.prisma.category.aggregate({
      where: { householdId: ctx.householdId, deletedAt: null },
      _max: { position: true },
    });
    return this.guardUnique(async () =>
      toDto(
        await this.prisma.category.create({
          data: {
            householdId: ctx.householdId,
            name: input.name,
            emoji: input.emoji ?? null,
            position: (last._max.position ?? -1) + 1,
          },
        }),
      ),
    );
  }

  async update(
    ctx: HouseholdContext,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    await this.findOrThrow(ctx, id);
    return this.guardUnique(async () =>
      toDto(
        await this.prisma.category.update({
          where: { id },
          // Renommée par l'utilisateur : la clé de traduction par défaut ne s'applique plus.
          data: { ...input, ...(input.name !== undefined ? { key: null } : {}) },
        }),
      ),
    );
  }

  /** Suppression douce ; les tâches de la catégorie deviennent « sans catégorie ». */
  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    await this.findOrThrow(ctx, id);
    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { householdId: ctx.householdId, categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
  }

  private async findOrThrow(ctx: HouseholdContext, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, householdId: ctx.householdId, deletedAt: null },
    });
    if (!category) throw notFound();
    return category;
  }

  private async guardUnique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppException(
          'CATEGORY_NAME_TAKEN',
          HttpStatus.CONFLICT,
          'Category name already used',
        );
      }
      throw e;
    }
  }
}
