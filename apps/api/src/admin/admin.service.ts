import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdminCreateUserInput,
  AdminHouseholdDto,
  AdminOverviewDto,
  AdminTestResultDto,
  AdminUserDto,
  BackupRunDto,
} from '@agenda/contracts';
import { AuthService, isAdminEmail } from '../auth/auth.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { AppException, notFound } from '../common/app-exception';
import { env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { testEmail } from '../mail/templates';
import { PushService } from '../notifications/push.service';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from '../privacy/privacy.service';

const DAY = 86_400_000;

/**
 * Administration de l'instance : vue d'ensemble, comptes, foyers, sauvegardes, tests.
 * Jamais de contenu des foyers (titres, notes) : des nombres et des métadonnées seulement.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly resets: PasswordResetService,
    private readonly privacy: PrivacyService,
    private readonly mail: MailService,
    private readonly push: PushService,
    private readonly webPush: WebPushService,
  ) {}

  async overview(): Promise<AdminOverviewDto> {
    const since = new Date(Date.now() - 7 * DAY);
    const [
      users,
      disabledUsers,
      households,
      tasks,
      openOccurrences,
      doneLast7Days,
      shoppingItems,
      comments,
      attachments,
      openReports,
      db,
      calendar,
      backups,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, disabledAt: { not: null } } }),
      this.prisma.household.count({ where: { deletedAt: null } }),
      this.prisma.task.count({ where: { deletedAt: null } }),
      this.prisma.taskOccurrence.count({ where: { status: 'TODO', task: { deletedAt: null } } }),
      this.prisma.taskOccurrence.count({ where: { status: 'DONE', completedAt: { gte: since } } }),
      this.prisma.shoppingItem.count(),
      this.prisma.taskComment.count(),
      this.prisma.taskAttachment.aggregate({ _count: true, _sum: { size: true } }),
      this.prisma.report.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.$queryRaw<
        { size: bigint }[]
      >`SELECT pg_database_size(current_database()) AS size`,
      this.prisma.calendarEventLink.groupBy({ by: ['syncStatus'], _count: true }),
      this.backups(),
    ]);
    const e = env();
    return {
      counts: {
        users,
        disabledUsers,
        households,
        tasks,
        openOccurrences,
        doneLast7Days,
        shoppingItems,
        comments,
        attachments: attachments._count,
        openReports,
      },
      storage: {
        databaseBytes: Number(db[0]?.size ?? 0),
        attachmentsBytes: attachments._sum.size ?? 0,
      },
      calendar: Object.fromEntries(calendar.map((c) => [c.syncStatus, c._count])),
      integrations: [
        { key: 'email', enabled: this.mail.enabled },
        { key: 'googleSignIn', enabled: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) },
        { key: 'androidPush', enabled: this.push.enabled },
        { key: 'webPush', enabled: this.webPush.enabled },
        {
          key: 'inboundEmail',
          enabled: Boolean(e.INBOUND_EMAIL_ADDRESS && e.RESEND_WEBHOOK_SECRET && e.RESEND_API_KEY),
        },
        { key: 'errorTracking', enabled: Boolean(e.SENTRY_DSN) },
      ],
      registrationEnabled: e.REGISTRATION_ENABLED,
      backups,
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async users(): Promise<AdminUserDto[]> {
    const rows = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        identities: { select: { provider: true } },
        memberships: { where: { leftAt: null }, select: { household: { select: { name: true } } } },
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          select: { lastUsedAt: true, familyId: true },
        },
      },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      locale: u.locale,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt:
        u.sessions
          .map((s) => s.lastUsedAt)
          .sort((a, b) => b.getTime() - a.getTime())[0]
          ?.toISOString() ?? null,
      // Un appareil = une famille de sessions (les rotations créent des sessions successives).
      activeSessions: new Set(u.sessions.map((s) => s.familyId)).size,
      hasPassword: u.passwordHash !== null,
      googleLinked: u.identities.some((i) => i.provider === 'GOOGLE'),
      households: u.memberships.map((m) => m.household.name),
      disabled: u.disabledAt !== null,
      isAdmin: isAdminEmail(u.email),
    }));
  }

  /** Compte créé sans mot de passe (même inscriptions fermées) ; lien d'accueil valable 7 jours. */
  async createUser(adminId: string, input: AdminCreateUserInput): Promise<AdminUserDto> {
    try {
      const user = await this.prisma.user.create({
        data: { email: input.email, displayName: input.displayName, locale: input.locale },
      });
      this.logger.log({ adminId, userId: user.id }, 'admin: user created');
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new AppException('EMAIL_ALREADY_USED', HttpStatus.CONFLICT, 'Email already used');
      throw e;
    }
    await this.resets.request(input.email, { welcome: true });
    return (await this.users()).find((u) => u.email === input.email)!;
  }

  async setDisabled(adminId: string, userId: string, disabled: boolean): Promise<void> {
    this.notSelf(adminId, userId);
    await this.user(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { disabledAt: disabled ? new Date() : null },
    });
    // Désactivé : déconnecté partout, tout de suite (le garde vérifie la session à chaque requête).
    if (disabled) await this.auth.logoutAll(userId);
    this.logger.log({ adminId, userId, disabled }, 'admin: user disabled flag');
  }

  async logoutAll(adminId: string, userId: string): Promise<void> {
    await this.user(userId);
    await this.auth.logoutAll(userId);
    this.logger.log({ adminId, userId }, 'admin: sessions revoked');
  }

  async sendPasswordReset(adminId: string, userId: string): Promise<void> {
    const user = await this.user(userId);
    await this.resets.request(user.email, { welcome: !user.passwordHash });
    this.logger.log({ adminId, userId }, 'admin: password link sent');
  }

  async deleteUser(adminId: string, userId: string): Promise<void> {
    this.notSelf(adminId, userId);
    await this.user(userId);
    await this.privacy.purge(userId);
    this.logger.log({ adminId, userId }, 'admin: user deleted');
  }

  async households(): Promise<AdminHouseholdDto[]> {
    const rows = await this.prisma.household.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        members: {
          where: { leftAt: null },
          orderBy: { joinedAt: 'asc' },
          select: { displayName: true, role: true, user: { select: { email: true } } },
        },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
      },
    });
    const [open, files, last] = await Promise.all([
      this.prisma.taskOccurrence.groupBy({
        by: ['householdId'],
        where: { status: 'TODO', task: { deletedAt: null } },
        _count: true,
      }),
      this.prisma.taskAttachment.groupBy({ by: ['householdId'], _sum: { size: true } }),
      this.prisma.activityLog.groupBy({ by: ['householdId'], _max: { createdAt: true } }),
    ]);
    const openBy = new Map(open.map((o) => [o.householdId, o._count]));
    const filesBy = new Map(files.map((f) => [f.householdId, f._sum.size ?? 0]));
    const lastBy = new Map(last.map((l) => [l.householdId, l._max.createdAt]));
    return rows.map((h) => ({
      id: h.id,
      name: h.name,
      createdAt: h.createdAt.toISOString(),
      members: h.members.map((m) => ({
        displayName: m.displayName,
        email: m.user?.email ?? null,
        role: m.role,
      })),
      tasks: h._count.tasks,
      openOccurrences: openBy.get(h.id) ?? 0,
      attachmentsBytes: filesBy.get(h.id) ?? 0,
      lastActivityAt: lastBy.get(h.id)?.toISOString() ?? null,
    }));
  }

  /** Sauvegarde à la demande : le conteneur `backup` la prend en charge dans la minute. */
  async requestBackup(adminId: string): Promise<BackupRunDto> {
    const pending = await this.prisma.backupRun.findFirst({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
    });
    if (pending) return toBackup(pending);
    const run = await this.prisma.backupRun.create({
      data: { trigger: 'manual', status: 'PENDING', requestedBy: adminId },
    });
    this.logger.log({ adminId }, 'admin: backup requested');
    return toBackup(run);
  }

  async backups(): Promise<BackupRunDto[]> {
    const rows = await this.prisma.backupRun.findMany({ orderBy: { createdAt: 'desc' }, take: 15 });
    return rows.map(toBackup);
  }

  async testEmail(adminId: string): Promise<AdminTestResultDto> {
    const me = await this.user(adminId);
    if (!this.mail.enabled) return { ok: false, detail: 'SMTP_NOT_CONFIGURED' };
    try {
      await this.mail.send({ to: me.email, ...testEmail(me.locale === 'en' ? 'en' : 'fr') });
      return { ok: true, detail: me.email };
    } catch (e) {
      return { ok: false, detail: (e as Error).message.slice(0, 200) };
    }
  }

  async testPush(adminId: string): Promise<AdminTestResultDto> {
    const me = await this.user(adminId);
    const fr = me.locale !== 'en';
    const [phones, browsers] = await Promise.all([
      this.push.wakeUser(adminId).catch(() => 0),
      this.webPush
        .sendToUser(adminId, {
          title: 'Tandem',
          body: fr ? 'Notification de test : tout fonctionne.' : 'Test notification: all good.',
          url: '/admin',
          tag: 'admin-test',
        })
        .catch(() => 0),
    ]);
    return { ok: phones + browsers > 0, detail: `phones=${phones};browsers=${browsers}` };
  }

  private async user(id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!u) throw notFound();
    return u;
  }

  private notSelf(adminId: string, userId: string) {
    if (adminId === userId)
      throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN, 'Not on your own account');
  }
}

const toBackup = (r: {
  id: string;
  trigger: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  file: string | null;
  sizeBytes: bigint | null;
  summary: string | null;
  offsite: boolean;
}): BackupRunDto => ({
  id: r.id,
  trigger: r.trigger,
  status: r.status as BackupRunDto['status'],
  createdAt: r.createdAt.toISOString(),
  startedAt: r.startedAt?.toISOString() ?? null,
  finishedAt: r.finishedAt?.toISOString() ?? null,
  file: r.file,
  sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
  summary: r.summary,
  offsite: r.offsite,
});
