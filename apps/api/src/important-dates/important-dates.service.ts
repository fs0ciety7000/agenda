import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ImportantDate } from '@prisma/client';
import {
  MAX_IMPORTANT_DATES,
  type ImportantDateDto,
  type ImportantDateInput,
} from '@agenda/contracts';
import { nextOccurrence, reminderDue, todayIn, wallClock } from '@agenda/domain';
import { AppException, notFound } from '../common/app-exception';
import { fromDbDate, toDbDate } from '../common/dates';
import { DomainEvents } from '../common/domain-events';
import { HouseholdContext } from '../common/request-context';
import { env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Passe des rappels : toutes les heures (et peu après le démarrage). */
const EVERY_MS = 60 * 60 * 1000;
/** Heure locale du foyer à partir de laquelle un rappel peut partir. */
const REMIND_FROM_MINUTE = 8 * 60;

const toDto = (d: ImportantDate, today: string): ImportantDateDto => {
  const next = nextOccurrence(d, today);
  return {
    id: d.id,
    title: d.title,
    kind: d.kind,
    month: d.month,
    day: d.day,
    year: d.year,
    repeatsYearly: d.repeatsYearly,
    remindDaysBefore: d.remindDaysBefore,
    createdById: d.createdById,
    nextDate: next?.date ?? null,
    daysLeft: next?.daysLeft ?? null,
    years: next?.years ?? null,
  };
};

/**
 * Dates importantes du foyer (anniversaires, fêtes, entretiens annuels). Une passe horaire
 * envoie le rappel à tout le foyer N jours avant, à partir de 8 h (heure du foyer), une seule
 * fois par occurrence (`remindedFor`), même avec plusieurs instances de l'API.
 */
@Injectable()
export class ImportantDatesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportantDatesService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    if (env().NODE_ENV === 'test') return;
    const run = () =>
      void this.sendReminders().catch((e: unknown) =>
        this.logger.warn(`Important date reminders failed: ${(e as Error).message}`),
      );
    this.timers.push(setTimeout(run, 60_000).unref(), setInterval(run, EVERY_MS).unref());
  }

  onModuleDestroy(): void {
    this.timers.forEach((t) => clearTimeout(t));
  }

  /** Prochaines d'abord ; les dates uniques passées en dernier. */
  async list(ctx: HouseholdContext): Promise<ImportantDateDto[]> {
    const today = todayIn(await this.timezone(ctx.householdId));
    const rows = await this.prisma.importantDate.findMany({
      where: { householdId: ctx.householdId },
    });
    return rows
      .map((d) => toDto(d, today))
      .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
  }

  async create(ctx: HouseholdContext, input: ImportantDateInput): Promise<ImportantDateDto> {
    const count = await this.prisma.importantDate.count({
      where: { householdId: ctx.householdId },
    });
    if (count >= MAX_IMPORTANT_DATES) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Too many dates',
      );
    }
    const row = await this.prisma.importantDate.create({
      data: {
        ...input,
        year: input.year ?? null,
        householdId: ctx.householdId,
        createdById: ctx.memberId,
      },
    });
    this.events.publish(ctx.householdId, 'dates');
    return toDto(row, todayIn(await this.timezone(ctx.householdId)));
  }

  async update(
    ctx: HouseholdContext,
    id: string,
    input: ImportantDateInput,
  ): Promise<ImportantDateDto> {
    const current = await this.prisma.importantDate.findFirst({
      where: { id, householdId: ctx.householdId },
    });
    if (!current) throw notFound();
    const moved =
      current.month !== input.month ||
      current.day !== input.day ||
      current.year !== (input.year ?? null) ||
      current.repeatsYearly !== input.repeatsYearly ||
      current.remindDaysBefore !== input.remindDaysBefore;
    const row = await this.prisma.importantDate.update({
      where: { id },
      // Date ou délai changés : le rappel pourra repartir pour la nouvelle occurrence.
      data: { ...input, year: input.year ?? null, ...(moved ? { remindedFor: null } : {}) },
    });
    this.events.publish(ctx.householdId, 'dates');
    return toDto(row, todayIn(await this.timezone(ctx.householdId)));
  }

  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    const { count } = await this.prisma.importantDate.deleteMany({
      where: { id, householdId: ctx.householdId },
    });
    if (!count) throw notFound();
    this.events.publish(ctx.householdId, 'dates');
  }

  private async timezone(householdId: string): Promise<string> {
    const h = await this.prisma.household.findUniqueOrThrow({
      where: { id: householdId },
      select: { timezone: true },
    });
    return h.timezone;
  }

  /** Passe des rappels (horaire ; les tests l'appellent avec une heure donnée). */
  async sendReminders(now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.importantDate.findMany({
      include: { household: { select: { timezone: true } } },
    });
    let sent = 0;
    for (const d of rows) {
      const clock = wallClock(now, d.household.timezone);
      if (clock.minute < REMIND_FROM_MINUTE) continue;
      const next = nextOccurrence(d, clock.date);
      if (!next || !reminderDue(next, d.remindDaysBefore)) continue;
      if (fromDbDate(d.remindedFor) === next.date) continue;
      // Réservation atomique : une seule instance envoie ce rappel.
      const { count } = await this.prisma.importantDate.updateMany({
        where: {
          id: d.id,
          OR: [{ remindedFor: null }, { remindedFor: { not: toDbDate(next.date) } }],
        },
        data: { remindedFor: toDbDate(next.date) },
      });
      if (!count) continue;
      await this.notifications.notifyImportantDate(d.householdId, d.title, {
        dateId: d.id,
        date: next.date,
        daysLeft: next.daysLeft,
      });
      sent++;
    }
    return sent;
  }
}
