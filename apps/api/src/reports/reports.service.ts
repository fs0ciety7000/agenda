import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  type AdminReportDto,
  type AdminReportsQuery,
  type AdminUpdateReportInput,
  type CreateReportInput,
  REPORT_RETENTION_DAYS,
  REPORT_SCREENSHOT_MAX_BYTES,
  REPORT_SCREENSHOT_TYPES,
  REPORTS_PER_DAY,
  type ReportDiagnostics,
  type ReportDto,
} from '@agenda/contracts';
import { Prisma, type Report } from '@prisma/client';
import { isAdminEmail } from '../auth/auth.service';
import { AppException, notFound } from '../common/app-exception';
import { env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { reportNewEmail, reportReplyEmail } from '../mail/templates';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;
const PURGE_EVERY_MS = 6 * 3_600_000;

type ReportRow = Omit<Report, 'screenshot'> & { hasScreenshot: boolean };

const SELECT = {
  id: true,
  userId: true,
  kind: true,
  status: true,
  title: true,
  description: true,
  allowContact: true,
  diagnostics: true,
  screenshotType: true,
  reply: true,
  repliedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReportSelect;

/**
 * Signalements : envoyés par les utilisateurs, traités par les administrateurs (ADMIN_EMAILS).
 * Chacun ne voit que les siens ; les administrateurs sont prévenus à chaque nouveau signalement.
 * Conservation : tant que le signalement est ouvert, puis 180 jours après sa clôture ; effacé
 * avec le compte (cascade).
 */
@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly webPush: WebPushService,
  ) {}

  onModuleInit(): void {
    if (env().NODE_ENV === 'test') return;
    const run = () =>
      void this.purge().catch((e: unknown) => this.logger.error({ err: e }, 'purge failed'));
    run();
    this.timer = setInterval(run, PURGE_EVERY_MS).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async create(userId: string, input: CreateReportInput): Promise<ReportDto> {
    const recent = await this.prisma.report.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (recent >= REPORTS_PER_DAY) {
      throw new AppException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, 'Too many reports');
    }
    const created = await this.prisma.report.create({
      data: {
        userId,
        kind: input.kind,
        title: input.title,
        description: input.description,
        allowContact: input.allowContact,
        diagnostics: input.diagnostics ?? Prisma.DbNull,
      },
      select: SELECT,
    });
    void this.alertAdmins(created).catch(() => {});
    return toDto({ ...created, hasScreenshot: false });
  }

  async attachScreenshot(
    userId: string,
    id: string,
    file: { mimetype: string; size: number; buffer: Buffer },
  ): Promise<ReportDto> {
    await this.own(userId, id);
    if (!(REPORT_SCREENSHOT_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Unsupported image', {
        fieldErrors: { file: ['PNG, JPEG or WebP only'] },
      });
    }
    if (file.size > REPORT_SCREENSHOT_MAX_BYTES) {
      throw new AppException('ATTACHMENT_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, 'Too large');
    }
    await this.prisma.report.update({
      where: { id },
      data: { screenshot: new Uint8Array(file.buffer), screenshotType: file.mimetype },
    });
    return this.getOwn(userId, id);
  }

  async mine(userId: string): Promise<ReportDto[]> {
    const rows = await this.rows({ userId });
    return rows.map(toDto);
  }

  async getOwn(userId: string, id: string): Promise<ReportDto> {
    const [row] = await this.rows({ id, userId });
    if (!row) throw notFound();
    return toDto(row);
  }

  /** L'auteur retire son signalement : effacé tout de suite (droit à l'effacement). */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.report.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound();
  }

  /** Capture d'écran, pour l'auteur ou un administrateur. */
  async screenshot(
    id: string,
    viewer: { userId: string; admin: boolean },
  ): Promise<{ data: Buffer; type: string }> {
    const r = await this.prisma.report.findFirst({
      where: { id, ...(viewer.admin ? {} : { userId: viewer.userId }) },
      select: { screenshot: true, screenshotType: true },
    });
    if (!r?.screenshot || !r.screenshotType) throw notFound();
    return { data: Buffer.from(r.screenshot), type: r.screenshotType };
  }

  // ── Administration ──

  async adminList(query: AdminReportsQuery): Promise<AdminReportDto[]> {
    const where: Prisma.ReportWhereInput =
      query.status === 'ALL'
        ? {}
        : query.status === 'ACTIVE'
          ? { status: { in: ['OPEN', 'IN_PROGRESS'] } }
          : { status: query.status };
    const rows = await this.rows(where, true);
    return rows.map((r) => ({ ...toDto(r), author: r.author! }));
  }

  async adminUpdate(id: string, input: AdminUpdateReportInput): Promise<AdminReportDto> {
    const before = await this.prisma.report.findUnique({
      where: { id },
      select: { status: true, allowContact: true, title: true, user: true },
    });
    if (!before) throw notFound();
    const status = input.status ?? before.status;
    const closing = status === 'RESOLVED' || status === 'CLOSED';
    await this.prisma.report.update({
      where: { id },
      data: {
        status,
        closedAt: closing ? (before.status === status ? undefined : new Date()) : null,
        ...(input.reply !== undefined ? { reply: input.reply, repliedAt: new Date() } : {}),
      },
    });
    if (input.reply !== undefined && before.allowContact) {
      const locale = before.user.locale === 'en' ? 'en' : 'fr';
      const mail = reportReplyEmail(locale, {
        title: before.title,
        reply: input.reply,
        status,
        url: `${env().WEB_ORIGIN}/report`,
      });
      await this.mail
        .send({ to: before.user.email, ...mail })
        .catch((e: unknown) => this.logger.warn({ err: e }, 'report reply not sent'));
    }
    const [row] = await this.rows({ id }, true);
    return { ...toDto(row!), author: row!.author! };
  }

  async adminRemove(id: string): Promise<void> {
    const { count } = await this.prisma.report.deleteMany({ where: { id } });
    if (count === 0) throw notFound();
  }

  /** Signalements clos depuis plus de 180 jours : effacés. */
  async purge(now = new Date()): Promise<number> {
    const { count } = await this.prisma.report.deleteMany({
      where: {
        status: { in: ['RESOLVED', 'CLOSED'] },
        closedAt: { lt: new Date(now.getTime() - REPORT_RETENTION_DAYS * DAY_MS) },
      },
    });
    if (count) this.logger.log({ count }, 'reports purged');
    return count;
  }

  private async own(userId: string, id: string): Promise<void> {
    const exists = await this.prisma.report.count({ where: { id, userId } });
    if (!exists) throw notFound();
  }

  private async rows(
    where: Prisma.ReportWhereInput,
    withAuthor = false,
  ): Promise<(ReportRow & { author?: { displayName: string; email: string } })[]> {
    const rows = await this.prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        ...SELECT,
        // Présence de la capture sans charger l'image.
        screenshotType: true,
        ...(withAuthor ? { user: { select: { displayName: true, email: true } } } : {}),
      },
    });
    return rows.map((r) => {
      const { user, ...rest } = r as typeof r & { user?: { displayName: string; email: string } };
      return { ...rest, hasScreenshot: r.screenshotType !== null, author: user };
    });
  }

  private async alertAdmins(report: Omit<Report, 'screenshot'>): Promise<void> {
    const author = await this.prisma.user.findUnique({
      where: { id: report.userId },
      select: { displayName: true },
    });
    const admins = (
      await this.prisma.user.findMany({
        where: { deletedAt: null, disabledAt: null },
        select: { id: true, email: true, locale: true },
      })
    ).filter((u) => isAdminEmail(u.email));
    for (const a of admins) {
      const mail = reportNewEmail(a.locale === 'en' ? 'en' : 'fr', {
        kind: report.kind,
        title: report.title,
        description: report.description,
        author: author?.displayName ?? '?',
        url: `${env().WEB_ORIGIN}/admin#reports`,
      });
      await this.mail.send({ to: a.email, ...mail }).catch(() => {});
      await this.webPush
        .sendToUser(a.id, {
          title: mail.subject,
          body: author?.displayName ?? '',
          url: '/admin#reports',
          tag: `report-${report.id}`,
        })
        .catch(() => 0);
    }
  }
}

function toDto(r: ReportRow): ReportDto {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    title: r.title,
    description: r.description,
    allowContact: r.allowContact,
    diagnostics: (r.diagnostics as ReportDiagnostics | null) ?? null,
    hasScreenshot: r.hasScreenshot,
    reply: r.reply,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
