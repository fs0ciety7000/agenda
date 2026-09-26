import { Injectable } from '@nestjs/common';
import type {
  NotificationDto,
  NotificationKind,
  NotificationListDto,
  NotificationPreferenceDto,
  NotificationQuery,
} from '@agenda/contracts';
import { Prisma } from '@prisma/client';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

export const NOTIFICATION_KINDS: NotificationKind[] = ['TASK_ASSIGNED', 'CALENDAR_SYNC_FAILED'];
const DEFAULT_PREF = { inApp: true, push: true };

interface AssignedPayload {
  occurrenceId: string;
  byMemberId: string;
  recurring: boolean;
}

/**
 * Notifications du foyer. La charge utile ne contient que des identifiants : titre, date et nom
 * sont relus à l'affichage (une tâche renommée ou supprimée n'affiche jamais d'information périmée).
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** « Nicolas vous a attribué une tâche » : jamais pour ses propres actions. */
  async notifyAssigned(
    ctx: HouseholdContext,
    occurrenceId: string,
    memberIds: string[],
    recurring: boolean,
  ): Promise<void> {
    const targets = [...new Set(memberIds)].filter((id) => id !== ctx.memberId);
    if (!targets.length) return;
    const members = await this.prisma.householdMember.findMany({
      where: {
        id: { in: targets },
        householdId: ctx.householdId,
        leftAt: null,
        userId: { not: null },
      },
      select: { id: true, preferences: { where: { type: 'TASK_ASSIGNED' } } },
    });
    const payload: AssignedPayload = { occurrenceId, byMemberId: ctx.memberId, recurring };
    const data = members
      .map((m) => ({ member: m, pref: m.preferences[0] ?? DEFAULT_PREF }))
      .filter(({ pref }) => pref.inApp || pref.push)
      .map(({ member, pref }) => ({
        memberId: member.id,
        type: 'TASK_ASSIGNED' as const,
        payload: { ...payload, push: pref.push } as unknown as Prisma.InputJsonValue,
      }));
    if (!data.length) return;
    await this.prisma.notification.createMany({ data });
    // Téléphones réveillés tout de suite (sans contenu) pour ceux qui veulent la notification.
    void this.push.wakeMembers(
      ctx.householdId,
      members.filter((m) => (m.preferences[0] ?? DEFAULT_PREF).push).map((m) => m.id),
    );
  }

  async list(ctx: HouseholdContext, query: NotificationQuery): Promise<NotificationListDto> {
    const prefs = await this.preferencesMap(ctx);
    const visibleTypes = NOTIFICATION_KINDS.filter((k) => prefs[k].inApp || prefs[k].push);
    const where: Prisma.NotificationWhereInput = {
      memberId: ctx.memberId,
      type: { in: visibleTypes },
      ...(query.since ? { createdAt: { gt: new Date(query.since) } } : {}),
    };
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      }),
      this.prisma.notification.count({
        where: {
          memberId: ctx.memberId,
          readAt: null,
          type: { in: NOTIFICATION_KINDS.filter((k) => prefs[k].inApp) },
        },
      }),
    ]);

    const assigned = rows
      .filter((r) => r.type === 'TASK_ASSIGNED')
      .map((r) => r.payload as unknown as AssignedPayload);
    const [occurrences, members] = await Promise.all([
      this.prisma.taskOccurrence.findMany({
        where: {
          id: { in: assigned.map((p) => p.occurrenceId) },
          householdId: ctx.householdId,
          task: { deletedAt: null },
          status: { notIn: ['CANCELLED'] },
        },
        select: { id: true, date: true, titleOverride: true, task: { select: { title: true } } },
      }),
      this.prisma.householdMember.findMany({
        where: { householdId: ctx.householdId },
        select: { id: true, displayName: true },
      }),
    ]);
    const occById = new Map(occurrences.map((o) => [o.id, o]));
    const nameById = new Map(members.map((m) => [m.id, m.displayName]));

    const items: NotificationDto[] = rows.map((r) => {
      const payload = r.payload as Record<string, unknown>;
      const occ =
        r.type === 'TASK_ASSIGNED' ? occById.get(payload.occurrenceId as string) : undefined;
      return {
        id: r.id,
        type: r.type as NotificationKind,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt?.toISOString() ?? null,
        push:
          r.type === 'TASK_ASSIGNED'
            ? payload.push !== false && prefs.TASK_ASSIGNED.push
            : prefs[r.type as NotificationKind].push,
        occurrenceId: occ?.id ?? null,
        title: occ ? (occ.titleOverride ?? occ.task.title) : null,
        date: occ?.date ? occ.date.toISOString().slice(0, 10) : null,
        recurring: payload.recurring === true,
        byName:
          typeof payload.byMemberId === 'string'
            ? (nameById.get(payload.byMemberId) ?? null)
            : null,
        code: typeof payload.code === 'string' ? payload.code : null,
      };
    });
    return { unread, items };
  }

  async markRead(ctx: HouseholdContext, ids?: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { memberId: ctx.memberId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
  }

  async preferences(ctx: HouseholdContext): Promise<NotificationPreferenceDto[]> {
    const map = await this.preferencesMap(ctx);
    return NOTIFICATION_KINDS.map((type) => ({ type, ...map[type] }));
  }

  async updatePreferences(
    ctx: HouseholdContext,
    prefs: NotificationPreferenceDto[],
  ): Promise<NotificationPreferenceDto[]> {
    await this.prisma.$transaction(
      prefs.map((p) =>
        this.prisma.notificationPreference.upsert({
          where: { memberId_type: { memberId: ctx.memberId, type: p.type } },
          create: { memberId: ctx.memberId, type: p.type, inApp: p.inApp, push: p.push },
          update: { inApp: p.inApp, push: p.push },
        }),
      ),
    );
    return this.preferences(ctx);
  }

  private async preferencesMap(ctx: HouseholdContext) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { memberId: ctx.memberId },
    });
    const map = Object.fromEntries(
      NOTIFICATION_KINDS.map((k) => [k, { ...DEFAULT_PREF }]),
    ) as Record<NotificationKind, { inApp: boolean; push: boolean }>;
    for (const r of rows) {
      if ((NOTIFICATION_KINDS as string[]).includes(r.type))
        map[r.type as NotificationKind] = { inApp: r.inApp, push: r.push };
    }
    return map;
  }
}
