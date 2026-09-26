import { HttpStatus, Injectable } from '@nestjs/common';
import type { DeleteAccountInput } from '@agenda/contracts';
import { AppException } from '../common/app-exception';
import { fromDbDate } from '../common/dates';
import { PasswordService } from '../auth/password.service';
import { CalendarConnectionService } from '../calendar/calendar-connection.service';
import { PrismaService } from '../prisma/prisma.service';

/** Nom affiché d'un ancien membre dont le compte a été supprimé. */
const FORMER_MEMBER = { fr: 'Ancien membre', en: 'Former member' } as const;

/**
 * Droits RGPD : portabilité (export JSON) et effacement (art. 17).
 * Principe : tout ce qui n'appartient qu'à l'utilisateur disparaît ; l'historique partagé du foyer
 * est conservé mais anonymisé (le membre devient « Ancien membre », sans lien vers le compte).
 */
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly calendar: CalendarConnectionService,
  ) {}

  async export(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        identities: { select: { provider: true, createdAt: true } },
        sessions: {
          select: {
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
            revokedAt: true,
            userAgent: true,
          },
        },
        memberships: {
          include: {
            household: {
              include: {
                members: { where: { leftAt: null }, select: { displayName: true, role: true } },
              },
            },
          },
        },
      },
    });
    const memberIds = user.memberships.map((m) => m.id);
    const [createdTasks, assigned] = await Promise.all([
      this.prisma.task.findMany({
        where: { createdById: { in: memberIds }, deletedAt: null },
        include: {
          category: { select: { name: true } },
          series: {
            select: {
              rule: true,
              startDate: true,
              untilDate: true,
              startMinute: true,
              durationMinutes: true,
            },
          },
          occurrences: {
            select: {
              date: true,
              startMinute: true,
              durationMinutes: true,
              status: true,
              completedAt: true,
              checklist: { select: { text: true, done: true }, orderBy: { position: 'asc' } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.taskOccurrence.findMany({
        where: { assignees: { some: { memberId: { in: memberIds } } }, task: { deletedAt: null } },
        select: { date: true, status: true, completedAt: true, task: { select: { title: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);
    return {
      format: 'agenda-gn-export/1',
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        displayName: user.displayName,
        locale: user.locale,
        createdAt: user.createdAt,
        hasPassword: user.passwordHash !== null,
        linkedProviders: user.identities,
      },
      sessions: user.sessions,
      households: user.memberships.map((m) => ({
        name: m.household.name,
        timezone: m.household.timezone,
        role: m.role,
        displayName: m.displayName,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        members: m.household.members,
      })),
      tasksCreated: createdTasks.map((t) => ({
        title: t.title,
        notes: t.notes,
        category: t.category?.name ?? null,
        priority: t.priority,
        visibility: t.visibility,
        createdAt: t.createdAt,
        recurrence: t.series.map((s) => ({
          ...s,
          startDate: fromDbDate(s.startDate),
          untilDate: fromDbDate(s.untilDate),
        })),
        occurrences: t.occurrences.map((o) => ({ ...o, date: fromDbDate(o.date) })),
      })),
      assignedOccurrences: assigned.map((o) => ({
        title: o.task.title,
        date: fromDbDate(o.date),
        status: o.status,
        completedAt: o.completedAt,
      })),
    };
  }

  async deleteAccount(userId: string, input: DeleteAccountInput): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { where: { leftAt: null } } },
    });
    const confirmed = user.passwordHash
      ? Boolean(input.password) && (await this.passwords.verify(user.passwordHash, input.password!))
      : Boolean(input.confirm);
    if (!confirmed) {
      throw new AppException(
        'CONFIRMATION_REQUIRED',
        HttpStatus.FORBIDDEN,
        'Password or confirmation required',
      );
    }
    const formerName = FORMER_MEMBER[user.locale === 'en' ? 'en' : 'fr'];

    // Autorisations Google Calendar révoquées auprès de Google (les événements du calendrier
    // partagé restent ; l'autre membre peut reconnecter son propre compte pour reprendre la synchro).
    for (const c of await this.prisma.googleConnection.findMany({ where: { userId } })) {
      await this.calendar.revokeQuietly(c.refreshTokenEnc);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const m of user.memberships) {
        const others = await tx.householdMember.findMany({
          where: { householdId: m.householdId, leftAt: null, id: { not: m.id } },
          orderBy: { joinedAt: 'asc' },
        });
        if (others.length === 0) {
          // Seul membre : le foyer et toutes ses données disparaissent.
          await tx.household.delete({ where: { id: m.householdId } });
          continue;
        }
        if (m.role === 'OWNER' && !others.some((o) => o.role === 'OWNER')) {
          await tx.householdMember.update({
            where: { id: others[0]!.id },
            data: { role: 'OWNER' },
          });
        }
        // Tâches personnelles : effacées. Tâches partagées : restent au foyer.
        await tx.task.deleteMany({ where: { createdById: m.id, visibility: 'PERSONAL' } });
        // Plus de responsabilités futures : ces tâches deviennent « à définir » ou passent à l'autre membre.
        await tx.occurrenceAssignee.deleteMany({
          where: { memberId: m.id, occurrence: { status: 'TODO' } },
        });
        await tx.rotationSlot.deleteMany({ where: { memberId: m.id } });
        await tx.notification.deleteMany({ where: { memberId: m.id } });
        await tx.notificationPreference.deleteMany({ where: { memberId: m.id } });
        await tx.householdInvitation.deleteMany({ where: { invitedById: m.id } });
        await tx.householdMember.update({
          where: { id: m.id },
          data: { userId: null, displayName: formerName, role: 'MEMBER', leftAt: new Date() },
        });
      }
      // Réponses mémorisées pour le rejeu hors ligne (contiennent des titres de tâches).
      await tx.idempotencyKey.deleteMany({ where: { userId } });
      // Compte, sessions, identités Google, jetons : suppression définitive (cascade).
      await tx.user.delete({ where: { id: userId } });
    });
  }
}
