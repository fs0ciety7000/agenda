import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ABSENCE_MAX_DAYS, type AbsenceDto, type CreateAbsenceInput } from '@agenda/contracts';
import { coverAbsence, diffDays, todayIn } from '@agenda/domain';
import { AppException, notFound } from '../common/app-exception';
import { fromDbDate, toDbDate } from '../common/dates';
import { DomainEvents } from '../common/domain-events';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { SeriesService } from './series.service';

type Tx = Prisma.TransactionClient;

const invalid = (field: string, message: string) =>
  new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, message, {
    fieldErrors: { [field]: [message] },
  });

/**
 * Mode absence : pendant l'absence d'un membre, ses tâches partagées passent aux autres. Les
 * répétitions sont recalculées (rotation comprise) ; les tâches ponctuelles à son nom sont
 * confiées aux présents. À la fin (ou à la suppression), les répétitions reprennent leur cours.
 */
@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly series: SeriesService,
    private readonly events: DomainEvents,
  ) {}

  /** Absences en cours et à venir. */
  async list(ctx: HouseholdContext): Promise<AbsenceDto[]> {
    const today = todayIn(await this.timezone(ctx));
    const rows = await this.prisma.memberAbsence.findMany({
      where: { householdId: ctx.householdId, endDate: { gte: toDbDate(today) } },
      orderBy: { startDate: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(ctx: HouseholdContext, input: CreateAbsenceInput): Promise<AbsenceDto> {
    const today = todayIn(await this.timezone(ctx));
    if (input.endDate < today) throw invalid('endDate', 'Absence is in the past');
    if (diffDays(input.startDate, input.endDate) >= ABSENCE_MAX_DAYS)
      throw invalid('endDate', 'Absence is too long');
    const member = await this.prisma.householdMember.findFirst({
      where: { id: input.memberId, householdId: ctx.householdId, leftAt: null },
      select: { displayName: true },
    });
    if (!member) throw invalid('memberId', 'Unknown member');

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.memberAbsence.create({
        data: {
          householdId: ctx.householdId,
          memberId: input.memberId,
          startDate: toDbDate(input.startDate),
          endDate: toDbDate(input.endDate),
        },
      });
      const from = input.startDate > today ? input.startDate : today;
      await this.refreshSeries(tx, ctx.householdId, from, input.endDate);
      await this.coverSingles(tx, ctx.householdId, from, input.endDate);
      await this.log(tx, ctx, 'absence.created', created.id, member.displayName, input);
      return created;
    });
    this.events.householdChanged(ctx.householdId);
    return toDto(row);
  }

  /** Fin anticipée / annulation : les répétitions reviennent à leur rotation normale. */
  async remove(ctx: HouseholdContext, id: string): Promise<void> {
    const row = await this.prisma.memberAbsence.findFirst({
      where: { id, householdId: ctx.householdId },
      include: { member: { select: { displayName: true } } },
    });
    if (!row) throw notFound();
    const today = todayIn(await this.timezone(ctx));
    const start = fromDbDate(row.startDate)!;
    const end = fromDbDate(row.endDate)!;
    await this.prisma.$transaction(async (tx) => {
      await tx.memberAbsence.delete({ where: { id } });
      if (end >= today)
        await this.refreshSeries(tx, ctx.householdId, start > today ? start : today, end);
      await this.log(tx, ctx, 'absence.deleted', id, row.member.displayName, {
        startDate: start,
        endDate: end,
      });
    });
    this.events.householdChanged(ctx.householdId);
  }

  private async refreshSeries(tx: Tx, householdId: string, from: string, to: string) {
    const series = await tx.taskSeries.findMany({
      where: {
        task: { householdId, deletedAt: null, visibility: 'SHARED' },
        occurrences: {
          some: {
            status: 'TODO',
            originalDate: { gte: toDbDate(from), lte: toDbDate(to) },
          },
        },
      },
      select: { id: true },
    });
    for (const s of series) await this.series.refreshAssignees(tx, s.id, from, to);
  }

  /** Tâches ponctuelles (et occurrences modifiées à la main) confiées à un absent. */
  private async coverSingles(tx: Tx, householdId: string, from: string, to: string) {
    const [absences, members] = await Promise.all([
      tx.memberAbsence.findMany({
        where: { householdId, endDate: { gte: toDbDate(from) } },
        select: { memberId: true, startDate: true, endDate: true },
      }),
      tx.householdMember.findMany({
        where: { householdId, leftAt: null },
        orderBy: { joinedAt: 'asc' },
        select: { id: true },
      }),
    ]);
    const occs = await tx.taskOccurrence.findMany({
      where: {
        householdId,
        status: 'TODO',
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        OR: [{ seriesId: null }, { isException: true }],
        task: { deletedAt: null, visibility: 'SHARED' },
        assignees: { some: { memberId: { in: absences.map((a) => a.memberId) } } },
      },
      include: { assignees: true },
    });
    for (const occ of occs) {
      const date = fromDbDate(occ.date)!;
      const absent = new Set(
        absences
          .filter((a) => fromDbDate(a.startDate)! <= date && date <= fromDbDate(a.endDate)!)
          .map((a) => a.memberId),
      );
      const current = occ.assignees.map((a) => a.memberId);
      const next = coverAbsence(
        current,
        absent,
        members.map((m) => m.id),
      );
      if (next.join() === current.join()) continue;
      await tx.occurrenceAssignee.deleteMany({ where: { occurrenceId: occ.id } });
      await tx.occurrenceAssignee.createMany({
        data: next.map((memberId) => ({ occurrenceId: occ.id, memberId })),
      });
      await tx.taskOccurrence.update({
        where: { id: occ.id },
        data: { version: { increment: 1 }, syncVersion: { increment: 1 } },
      });
    }
  }

  private log(
    tx: Tx,
    ctx: HouseholdContext,
    action: string,
    id: string,
    name: string,
    period: { startDate: string; endDate: string },
  ) {
    return tx.activityLog.create({
      data: {
        householdId: ctx.householdId,
        actorId: ctx.memberId,
        action,
        entityType: 'MemberAbsence',
        entityId: id,
        data: { startDate: period.startDate, endDate: period.endDate, date: period.startDate },
        title: name,
      },
    });
  }

  private async timezone(ctx: HouseholdContext) {
    const h = await this.prisma.household.findUniqueOrThrow({
      where: { id: ctx.householdId },
      select: { timezone: true },
    });
    return h.timezone;
  }
}

const toDto = (a: {
  id: string;
  memberId: string;
  startDate: Date;
  endDate: Date;
}): AbsenceDto => ({
  id: a.id,
  memberId: a.memberId,
  startDate: fromDbDate(a.startDate)!,
  endDate: fromDbDate(a.endDate)!,
});
