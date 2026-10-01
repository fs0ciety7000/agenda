import { Injectable } from '@nestjs/common';
import type { IcalFeedDto } from '@agenda/contracts';
import { randomBytes } from 'node:crypto';
import { notFound } from '../common/app-exception';
import { fromDbDate, toDbDate } from '../common/dates';
import type { HouseholdContext } from '../common/request-context';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { buildCalendar, type IcalEvent } from './ical';

/** Fenêtre publiée : un peu de passé (tâches faites), une année à venir. */
const PAST_DAYS = 60;
const FUTURE_DAYS = 366;
const DEFAULT_MINUTES = 30;

const feedUrl = (token: string) => `${env().WEB_ORIGIN.replace(/\/+$/, '')}/v1/ical/${token}.ics`;

/**
 * Abonnement iCal personnel, en lecture seule : les tâches datées que le membre voit (partagées
 * et ses tâches personnelles). L'adresse contient un jeton secret, révocable à tout moment.
 */
@Injectable()
export class IcalFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async settings(ctx: HouseholdContext): Promise<IcalFeedDto> {
    const m = await this.prisma.householdMember.findUniqueOrThrow({
      where: { id: ctx.memberId },
      select: { icalToken: true },
    });
    return { url: m.icalToken ? feedUrl(m.icalToken) : null };
  }

  /** Crée l'adresse, ou la remplace (l'ancienne cesse de fonctionner). */
  async regenerate(ctx: HouseholdContext): Promise<IcalFeedDto> {
    await this.prisma.householdMember.update({
      where: { id: ctx.memberId },
      data: { icalToken: randomBytes(20).toString('hex') },
    });
    return this.settings(ctx);
  }

  async disable(ctx: HouseholdContext): Promise<void> {
    await this.prisma.householdMember.update({
      where: { id: ctx.memberId },
      data: { icalToken: null },
    });
  }

  /** Contenu `.ics` pour un jeton ; introuvable si le jeton est inconnu ou le membre parti. */
  async feed(token: string, now = new Date()): Promise<string> {
    if (!/^[a-f0-9]{40}$/.test(token)) throw notFound();
    const member = await this.prisma.householdMember.findFirst({
      where: {
        icalToken: token,
        leftAt: null,
        user: { deletedAt: null, disabledAt: null },
        household: { deletedAt: null },
      },
      select: { id: true, householdId: true, household: { select: { name: true } } },
    });
    if (!member) throw notFound();

    const from = new Date(now.getTime() - PAST_DAYS * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(now.getTime() + FUTURE_DAYS * 86_400_000).toISOString().slice(0, 10);
    const occurrences = await this.prisma.taskOccurrence.findMany({
      where: {
        householdId: member.householdId,
        status: { in: ['TODO', 'DONE'] },
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        task: {
          deletedAt: null,
          OR: [{ visibility: 'SHARED' }, { createdById: member.id }],
        },
      },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      take: 5000,
      select: {
        id: true,
        date: true,
        startMinute: true,
        allDay: true,
        startsAt: true,
        endsAt: true,
        status: true,
        titleOverride: true,
        notesOverride: true,
        updatedAt: true,
        version: true,
        task: { select: { title: true, notes: true, location: true } },
        assignees: { select: { member: { select: { displayName: true } } } },
      },
    });

    const events: IcalEvent[] = occurrences.map((o) => {
      const names = o.assignees.map((a) => a.member.displayName);
      const title = [
        o.status === 'DONE' ? '✓ ' : '',
        o.titleOverride ?? o.task.title,
        names.length ? ` · ${names.join(' & ')}` : '',
      ].join('');
      const timed = !o.allDay && o.startMinute != null && o.startsAt;
      return {
        uid: `${o.id}@tandem`,
        title,
        description: o.notesOverride ?? o.task.notes,
        location: o.task.location,
        ...(timed
          ? {
              start: o.startsAt!,
              end: o.endsAt ?? new Date(o.startsAt!.getTime() + DEFAULT_MINUTES * 60_000),
            }
          : { date: fromDbDate(o.date)! }),
        updatedAt: o.updatedAt,
        sequence: o.version,
      };
    });
    return buildCalendar(`Tandem · ${member.household.name}`, events, now);
  }
}
