import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type ApplyTemplateInput,
  type OccurrenceDto,
  type TaskTemplateDto,
  TemplateItem,
  type TemplateInput,
} from '@agenda/contracts';
import { z } from 'zod';
import { notFound } from '../common/app-exception';
import { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

const Items = z.array(TemplateItem);

const toDto = (t: {
  id: string;
  name: string;
  emoji: string | null;
  items: Prisma.JsonValue;
}): TaskTemplateDto => ({
  id: t.id,
  name: t.name,
  emoji: t.emoji,
  // Données déjà validées à l'écriture ; relues prudemment (schéma qui évolue).
  items: Items.catch([]).parse(t.items),
});

/** Modèles de tâches du foyer : « Ménage du samedi » crée ses tâches d'un coup. */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  async list(ctx: HouseholdContext): Promise<TaskTemplateDto[]> {
    const rows = await this.prisma.taskTemplate.findMany({
      where: { householdId: ctx.householdId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(ctx: HouseholdContext, input: TemplateInput): Promise<TaskTemplateDto> {
    const row = await this.prisma.taskTemplate.create({
      data: {
        householdId: ctx.householdId,
        name: input.name,
        emoji: input.emoji ?? null,
        items: input.items as Prisma.InputJsonValue,
        createdById: ctx.memberId,
      },
    });
    return toDto(row);
  }

  async update(ctx: HouseholdContext, id: string, input: TemplateInput): Promise<TaskTemplateDto> {
    await this.find(ctx, id);
    const row = await this.prisma.taskTemplate.update({
      where: { id },
      data: {
        name: input.name,
        emoji: input.emoji ?? null,
        items: input.items as Prisma.InputJsonValue,
      },
    });
    return toDto(row);
  }

  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    await this.prisma.taskTemplate.deleteMany({ where: { id, householdId: ctx.householdId } });
  }

  /**
   * Crée une tâche par élément, pour la date choisie. Les membres partis et les catégories
   * supprimées depuis la création du modèle sont ignorés (plutôt qu'une erreur).
   */
  async apply(
    ctx: HouseholdContext,
    id: string,
    input: ApplyTemplateInput,
  ): Promise<OccurrenceDto[]> {
    const template = toDto(await this.find(ctx, id));
    const [members, categories, link] = await Promise.all([
      this.prisma.householdMember.findMany({
        where: { householdId: ctx.householdId, leftAt: null },
        select: { id: true },
      }),
      this.prisma.category.findMany({
        where: { householdId: ctx.householdId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.householdCalendarLink.findUnique({
        where: { householdId: ctx.householdId },
        select: { status: true },
      }),
    ]);
    const active = new Set(members.map((m) => m.id));
    const categoryIds = new Set(categories.map((c) => c.id));
    const date = input.date ?? null;
    const sync = Boolean(date) && (input.syncToCalendar ?? link?.status === 'ACTIVE');
    const created: OccurrenceDto[] = [];
    for (const item of template.items) {
      created.push(
        await this.tasks.create(ctx, {
          title: item.title,
          categoryId: item.categoryId && categoryIds.has(item.categoryId) ? item.categoryId : null,
          priority: 'NORMAL',
          visibility: 'SHARED',
          assigneeIds: item.assigneeIds.filter((m) => active.has(m)),
          date,
          startMinute: date ? (item.startMinute ?? null) : null,
          durationMinutes: item.durationMinutes ?? null,
          syncToCalendar: sync,
          checklist: item.checklist,
        }),
      );
    }
    return created;
  }

  private async find(ctx: HouseholdContext, id: string) {
    const row = await this.prisma.taskTemplate.findFirst({
      where: { id, householdId: ctx.householdId },
    });
    if (!row) throw notFound();
    return row;
  }
}
