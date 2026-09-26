import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AvailableCalendarDto, CalendarErrorCode, CalendarStatusDto } from '@agenda/contracts';
import { decodeJwt } from 'jose';
import { AppException } from '../common/app-exception';
import { HouseholdContext } from '../common/request-context';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarQueueService } from './calendar-queue.service';
import { GoogleCalendarSyncService } from './calendar-sync.service';
import { GoogleApiError, GoogleCalendarClient } from './google-calendar.client';
import { GoogleTokensService } from './google-tokens.service';

const WRITABLE = new Set(['owner', 'writer']);

/**
 * Connexion Google Calendar (distincte de Google Sign-In) et choix du calendrier partagé du foyer.
 * Le calendrier est toujours désigné par son `calendarId`, jamais par son nom.
 */
@Injectable()
export class CalendarConnectionService {
  private readonly logger = new Logger(CalendarConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarClient,
    private readonly tokens: GoogleTokensService,
    private readonly sync: GoogleCalendarSyncService,
    private readonly queue: CalendarQueueService,
  ) {}

  get configured(): boolean {
    return Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET && this.tokens.available);
  }

  assertConfigured() {
    if (!this.configured) {
      throw new AppException(
        'CALENDAR_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE,
        'Google Calendar is not configured',
      );
    }
  }

  get redirectUri() {
    return `${env().WEB_ORIGIN}/v1/calendar/google/callback`;
  }

  /** Enregistre (ou met à jour) la connexion après le retour OAuth. Le refresh token est chiffré. */
  async saveConnection(userId: string, code: string, codeVerifier: string): Promise<void> {
    const tokens = await this.google.exchangeCode({
      code,
      redirectUri: this.redirectUri,
      codeVerifier,
    });
    // id_token reçu directement de Google en TLS (client authentifié) : décodage suffisant (OIDC §3.1.3.7).
    const claims = tokens.idToken ? decodeJwt(tokens.idToken) : {};
    const sub = String(claims.sub ?? '');
    const email = String(claims.email ?? '');
    if (!sub) throw new GoogleApiError('bad_request', 400, 'missing id_token');
    const box = this.tokens.secretBox();
    const existing = await this.prisma.googleConnection.findUnique({
      where: { userId_googleSubject: { userId, googleSubject: sub } },
    });
    if (!tokens.refreshToken && !existing)
      throw new GoogleApiError('bad_request', 400, 'missing refresh_token');
    const data = {
      email,
      accessTokenEnc: box.encrypt(tokens.accessToken),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
      status: 'ACTIVE' as const,
      lastErrorCode: null,
      ...(tokens.refreshToken ? { refreshTokenEnc: box.encrypt(tokens.refreshToken) } : {}),
    };
    const connection = existing
      ? await this.prisma.googleConnection.update({ where: { id: existing.id }, data })
      : await this.prisma.googleConnection.create({
          data: {
            userId,
            googleSubject: sub,
            refreshTokenEnc: box.encrypt(tokens.refreshToken!),
            ...data,
          },
        });

    // Reconnexion après révocation : les calendriers liés à ce compte reprennent automatiquement.
    const relinked = await this.prisma.householdCalendarLink.findMany({
      where: { connectionId: connection.id, status: 'INVALID', lastErrorCode: 'GOOGLE_REVOKED' },
    });
    for (const link of relinked) {
      await this.prisma.householdCalendarLink.update({
        where: { id: link.id },
        data: { status: 'ACTIVE', lastErrorCode: null },
      });
      await this.queue.scheduleFull(link.householdId);
    }
  }

  private async myConnection(userId: string) {
    return this.prisma.googleConnection.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async status(ctx: HouseholdContext, userId: string): Promise<CalendarStatusDto> {
    const [connection, link] = await Promise.all([
      this.myConnection(userId),
      this.prisma.householdCalendarLink.findUnique({
        where: { householdId: ctx.householdId },
        include: {
          connection: {
            include: {
              user: {
                select: {
                  id: true,
                  memberships: {
                    where: { householdId: ctx.householdId },
                    select: { displayName: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    const counts = link
      ? await this.prisma.calendarEventLink.groupBy({
          by: ['syncStatus'],
          where: { calendarLinkId: link.id },
          _count: true,
        })
      : [];
    const count = (s: string) => counts.find((c) => c.syncStatus === s)?._count ?? 0;
    return {
      configured: this.configured,
      connection: connection
        ? { id: connection.id, email: connection.email, status: connection.status }
        : null,
      link: link
        ? {
            calendarId: link.googleCalendarId,
            summary: link.summary,
            accessRole: link.accessRole,
            status: link.status,
            errorCode: (link.lastErrorCode as CalendarErrorCode | null) ?? null,
            connectedByMe: link.connection.userId === userId,
            connectedBy: link.connection.user.memberships[0]?.displayName ?? null,
            connectionEmail: link.connection.email,
            lastReconciledAt: link.lastReconciledAt?.toISOString() ?? null,
          }
        : null,
      stats: { synced: count('SYNCED'), pending: count('PENDING'), errors: count('ERROR') },
    };
  }

  /** Calendriers accessibles avec le compte Google de l'utilisateur ; seuls owner/writer sont choisissables. */
  async available(userId: string): Promise<AvailableCalendarDto[]> {
    this.assertConfigured();
    const connection = await this.requireConnection(userId);
    const calendars = await this.call(() =>
      this.tokens.withToken(connection.id, (t) => this.google.listCalendars(t)),
    );
    return calendars
      .map((c) => ({
        id: c.id,
        summary: c.summary,
        accessRole: c.accessRole,
        primary: Boolean(c.primary),
        writable: WRITABLE.has(c.accessRole),
        color: c.backgroundColor ?? null,
      }))
      .sort(
        (a, b) => Number(b.writable) - Number(a.writable) || a.summary.localeCompare(b.summary),
      );
  }

  /** Choix du calendrier partagé (ex. « Commun G & N ») : droit d'écriture vérifié auprès de Google. */
  async link(
    ctx: HouseholdContext,
    userId: string,
    calendarId: string,
  ): Promise<CalendarStatusDto> {
    this.assertConfigured();
    const connection = await this.requireConnection(userId);
    const calendar = await this.call(() =>
      this.tokens.withToken(connection.id, (t) => this.google.getCalendar(t, calendarId)),
    );
    if (!WRITABLE.has(calendar.accessRole)) {
      throw new AppException(
        'CALENDAR_READ_ONLY',
        HttpStatus.FORBIDDEN,
        'No write access to this calendar',
      );
    }
    const existing = await this.prisma.householdCalendarLink.findUnique({
      where: { householdId: ctx.householdId },
    });
    if (existing && existing.googleCalendarId !== calendarId) {
      // Changement de calendrier : on retire nos événements de l'ancien, puis on repart de zéro.
      await this.sync.removeAllEvents(existing.id).catch(() => 0);
      await this.prisma.calendarEventLink.deleteMany({ where: { calendarLinkId: existing.id } });
    }
    const data = {
      connectionId: connection.id,
      googleCalendarId: calendar.id,
      summary: calendar.summary,
      accessRole: calendar.accessRole,
      timeZone: calendar.timeZone ?? null,
      status: 'ACTIVE' as const,
      lastErrorCode: null,
    };
    await this.prisma.householdCalendarLink.upsert({
      where: { householdId: ctx.householdId },
      create: { householdId: ctx.householdId, ...data },
      update: data,
    });
    await this.queue.scheduleFull(ctx.householdId);
    return this.status(ctx, userId);
  }

  /** Déconnecte le calendrier du foyer ; par défaut, retire aussi nos événements de Google. */
  async unlink(ctx: HouseholdContext, removeEvents: boolean): Promise<void> {
    const link = await this.prisma.householdCalendarLink.findUnique({
      where: { householdId: ctx.householdId },
    });
    if (!link) return;
    if (removeEvents) await this.sync.removeAllEvents(link.id);
    await this.prisma.householdCalendarLink.delete({ where: { id: link.id } });
  }

  /** Retire l'autorisation Google Calendar de l'utilisateur (révoquée auprès de Google). */
  async disconnect(userId: string): Promise<void> {
    const connections = await this.prisma.googleConnection.findMany({ where: { userId } });
    for (const c of connections) {
      for (const link of await this.prisma.householdCalendarLink.findMany({
        where: { connectionId: c.id },
      })) {
        await this.sync.removeAllEvents(link.id).catch(() => 0);
      }
      await this.revokeQuietly(c.refreshTokenEnc);
      await this.prisma.googleConnection.delete({ where: { id: c.id } });
    }
  }

  async revokeQuietly(refreshTokenEnc: string) {
    try {
      await this.google.revoke(this.tokens.secretBox().decrypt(refreshTokenEnc));
    } catch (e) {
      this.logger.warn(`Token revocation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async requireConnection(userId: string) {
    const connection = await this.myConnection(userId);
    if (!connection)
      throw new AppException(
        'CALENDAR_NOT_CONNECTED',
        HttpStatus.CONFLICT,
        'Connect Google Calendar first',
      );
    if (connection.status === 'REVOKED')
      throw new AppException('GOOGLE_REVOKED', HttpStatus.CONFLICT, 'Google access revoked');
    return connection;
  }

  /** Erreurs Google traduites en codes compréhensibles (jamais d'erreur technique brute). */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof GoogleApiError)) throw e;
      if (e.kind === 'invalid_grant')
        throw new AppException('GOOGLE_REVOKED', HttpStatus.CONFLICT, 'Google access revoked');
      if (e.kind === 'not_found')
        throw new AppException('CALENDAR_NOT_FOUND', HttpStatus.NOT_FOUND, 'Calendar not found');
      if (e.kind === 'forbidden')
        throw new AppException(
          'CALENDAR_READ_ONLY',
          HttpStatus.FORBIDDEN,
          'No access to this calendar',
        );
      throw new AppException('INTERNAL', HttpStatus.BAD_GATEWAY, 'Google Calendar unavailable');
    }
  }
}
