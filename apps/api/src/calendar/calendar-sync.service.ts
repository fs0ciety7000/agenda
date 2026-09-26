import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CalendarErrorCode } from '@agenda/contracts';
import { addDays, todayIn } from '@agenda/domain';
import { fromDbDate, toDbDate } from '../common/dates';
import { env } from '../config/env';
import { PushService } from '../notifications/push.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeriesService } from '../tasks/series.service';
import { GoogleApiError, GoogleCalendarClient, type GoogleEvent } from './google-calendar.client';
import { GoogleTokensService } from './google-tokens.service';

/** Fenêtre synchronisée : d'hier à J+60 (le passé n'est jamais réécrit). */
export const SYNC_PAST_DAYS = 1;
export const SYNC_FUTURE_DAYS = 60;
/** Tentatives avant d'abandonner une occurrence (réessayée ensuite par la synchro manuelle). */
const MAX_ATTEMPTS = 8;
/** Occurrence supprimée dans Google par un utilisateur : on ne la recrée pas (cf. A7). */
export const DELETED_IN_GOOGLE = 'DELETED_IN_GOOGLE';

/** Identifiant d'événement déterministe : `gn` + uuid sans tirets (base32hex ⊂ [a-v0-9]). */
export const eventIdFor = (occurrenceId: string) => `gn${occurrenceId.replace(/-/g, '')}`;

/** Délai de nouvelle tentative : 2^n secondes (max 1 h), ±20 % de gigue. */
export function backoffMs(attempt: number): number {
  const base = Math.min(2 ** attempt * 1000, 3_600_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

const occurrenceInclude = {
  task: {
    select: { id: true, title: true, visibility: true, syncToCalendar: true, deletedAt: true },
  },
  assignees: { select: { member: { select: { displayName: true } } } },
  eventLink: true,
} satisfies Prisma.TaskOccurrenceInclude;
type SyncOccurrence = Prisma.TaskOccurrenceGetPayload<{ include: typeof occurrenceInclude }>;

export interface SweepResult {
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  /** Erreur bloquante (droits, calendrier supprimé, accès révoqué). */
  blocked?: CalendarErrorCode;
  /** Prochaine tentative à planifier (quota Google ou erreurs temporaires). */
  retryInMs?: number;
}

const asGoogleError = (e: unknown) =>
  e instanceof GoogleApiError
    ? e
    : new GoogleApiError('network', 0, e instanceof Error ? e.message : String(e));

/** Erreurs qui empêchent toute synchronisation du foyer (action humaine nécessaire). */
function blockingCode(err: GoogleApiError): CalendarErrorCode | undefined {
  if (err.kind === 'invalid_grant') return 'GOOGLE_REVOKED';
  if (err.kind === 'forbidden') return 'CALENDAR_READ_ONLY';
  if (err.kind === 'not_found' && err.reason === 'calendar') return 'CALENDAR_NOT_FOUND';
  return undefined;
}

/** Une occurrence doit-elle exister dans le calendrier partagé ? */
function eligible(o: SyncOccurrence): boolean {
  return (
    !o.task.deletedAt &&
    o.task.syncToCalendar &&
    o.task.visibility === 'SHARED' &&
    o.date !== null &&
    (o.status === 'TODO' || o.status === 'DONE')
  );
}

/**
 * Synchronisation application → Google Calendar (l'application est la source de vérité).
 *
 * Modèle « outbox » : l'état à atteindre est dans PostgreSQL (`syncVersion` de l'occurrence vs
 * `syncedVersion` du mapping). Un balayage compare les deux et agit ; la file BullMQ ne sert qu'à
 * déclencher les balayages. Rien n'est perdu si Redis tombe : le balayage périodique rattrape tout.
 */
@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarClient,
    private readonly tokens: GoogleTokensService,
    private readonly series: SeriesService,
    private readonly push: PushService,
  ) {}

  // ───────────── Balayage ─────────────

  async sweep(householdId: string): Promise<SweepResult> {
    const result: SweepResult = { created: 0, updated: 0, deleted: 0, failed: 0 };
    const link = await this.prisma.householdCalendarLink.findUnique({
      where: { householdId },
      include: { connection: { include: { user: { select: { locale: true } } } }, household: true },
    });
    if (!link || link.status !== 'ACTIVE') return result;
    if (link.connection.status === 'REVOKED') {
      await this.block(link.id, 'GOOGLE_REVOKED');
      return { ...result, blocked: 'GOOGLE_REVOKED' };
    }

    const tz = link.household.timezone;
    const today = todayIn(tz);
    const from = addDays(today, -SYNC_PAST_DAYS);
    const to = addDays(today, SYNC_FUTURE_DAYS);
    await this.series.ensureHorizon(householdId, tz, to);
    const now = new Date();

    // Occurrences à créer / mettre à jour.
    const candidates = await this.prisma.taskOccurrence.findMany({
      where: {
        householdId,
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        status: { in: ['TODO', 'DONE'] },
        task: { deletedAt: null, syncToCalendar: true, visibility: 'SHARED' },
      },
      include: occurrenceInclude,
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
    });
    const toUpsert = candidates.filter((o) => {
      const l = o.eventLink;
      if (!l || l.calendarLinkId !== link.id || l.googleCalendarId !== link.googleCalendarId)
        return true;
      if (l.lastErrorCode === DELETED_IN_GOOGLE && l.syncedVersion >= o.syncVersion) return false;
      if (l.syncStatus === 'ERROR') return l.nextAttemptAt !== null && l.nextAttemptAt <= now;
      return l.syncStatus !== 'SYNCED' || l.syncedVersion < o.syncVersion;
    });

    // Événements à supprimer : occurrence disparue, annulée, tâche supprimée / personnelle / décochée.
    const links = await this.prisma.calendarEventLink.findMany({
      where: { calendarLinkId: link.id, syncStatus: { not: 'DELETED' } },
      include: { occurrence: { include: occurrenceInclude } },
    });
    const toDelete = links.filter(
      (l) =>
        (!l.occurrence || !eligible(l.occurrence)) &&
        (l.syncStatus !== 'ERROR' || (l.nextAttemptAt !== null && l.nextAttemptAt <= now)),
    );

    const locale = link.connection.user.locale === 'en' ? 'en' : 'fr';

    for (const occ of toUpsert) {
      try {
        const created = await this.upsertEvent(link, occ, { tz, locale });
        if (created) result.created++;
        else result.updated++;
      } catch (e) {
        const outcome = await this.handleError(link.id, e, {
          occurrenceId: occ.id,
          calendarLinkId: link.id,
          googleCalendarId: link.googleCalendarId,
          googleEventId: eventIdFor(occ.id),
        });
        if (outcome.blocked) return { ...result, blocked: outcome.blocked };
        if (outcome.rateLimited) return { ...result, retryInMs: backoffMs(5) };
        result.failed++;
      }
    }
    for (const l of toDelete) {
      try {
        await this.deleteEvent(link.connectionId, l);
        result.deleted++;
      } catch (e) {
        const outcome = await this.handleError(link.id, e, { id: l.id });
        if (outcome.blocked) return { ...result, blocked: outcome.blocked };
        if (outcome.rateLimited) return { ...result, retryInMs: backoffMs(5) };
        result.failed++;
      }
    }

    const nextRetry = await this.prisma.calendarEventLink.findFirst({
      where: { calendarLinkId: link.id, syncStatus: 'ERROR', nextAttemptAt: { not: null } },
      orderBy: { nextAttemptAt: 'asc' },
      select: { nextAttemptAt: true },
    });
    if (nextRetry?.nextAttemptAt)
      result.retryInMs = Math.max(1000, nextRetry.nextAttemptAt.getTime() - Date.now());
    return result;
  }

  /** Crée ou met à jour l'événement. Renvoie true si créé. Idempotent grâce à l'id déterministe. */
  private async upsertEvent(
    link: { id: string; connectionId: string; googleCalendarId: string },
    occ: SyncOccurrence,
    ctx: { tz: string; locale: 'fr' | 'en' },
  ): Promise<boolean> {
    const event = this.buildEvent(occ, link, ctx);
    const known =
      occ.eventLink?.syncStatus === 'SYNCED' &&
      occ.eventLink.googleCalendarId === link.googleCalendarId;
    let created = false;
    const saved = await this.tokens.withToken(link.connectionId, async (token) => {
      if (known) {
        try {
          return await this.google.patchEvent(token, link.googleCalendarId, event.id, {
            ...event,
            status: 'confirmed',
          });
        } catch (e) {
          if (!(e instanceof GoogleApiError && e.kind === 'not_found')) throw e;
          // Purgé côté Google : on le recrée avec le même identifiant.
        }
      }
      try {
        const res = await this.google.insertEvent(token, link.googleCalendarId, event);
        created = true;
        return res;
      } catch (e) {
        // L'identifiant existe déjà (crash après création, ou événement supprimé) : mise à jour.
        if (e instanceof GoogleApiError && e.kind === 'conflict') {
          return this.google.patchEvent(token, link.googleCalendarId, event.id, {
            ...event,
            status: 'confirmed',
          });
        }
        if (e instanceof GoogleApiError && e.kind === 'not_found')
          throw new GoogleApiError('not_found', 404, 'calendar');
        throw e;
      }
    });
    const data = {
      calendarLinkId: link.id,
      googleCalendarId: link.googleCalendarId,
      googleEventId: event.id,
      etag: saved.etag ?? null,
      syncStatus: 'SYNCED' as const,
      syncedVersion: occ.syncVersion,
      attempts: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
      lastSyncedAt: new Date(),
    };
    await this.prisma.calendarEventLink.upsert({
      where: { occurrenceId: occ.id },
      create: { occurrenceId: occ.id, ...data },
      update: data,
    });
    return created;
  }

  private async deleteEvent(
    connectionId: string,
    l: { id: string; occurrenceId: string | null; googleCalendarId: string; googleEventId: string },
  ) {
    await this.tokens.withToken(connectionId, async (token) => {
      try {
        await this.google.deleteEvent(token, l.googleCalendarId, l.googleEventId);
      } catch (e) {
        if (!(e instanceof GoogleApiError && e.kind === 'not_found')) throw e; // déjà supprimé : succès
      }
    });
    if (l.occurrenceId) {
      await this.prisma.calendarEventLink.update({
        where: { id: l.id },
        data: {
          syncStatus: 'DELETED',
          attempts: 0,
          nextAttemptAt: null,
          lastErrorCode: null,
          lastSyncedAt: new Date(),
        },
      });
    } else {
      await this.prisma.calendarEventLink.delete({ where: { id: l.id } });
    }
  }

  /**
   * Erreurs : bloquantes (droits, calendrier supprimé, révocation) ⇒ le lien du foyer passe en
   * INVALID et les membres sont prévenus ; quota ⇒ on s'arrête et on réessaie plus tard ;
   * temporaires ⇒ l'élément est réessayé avec un délai exponentiel.
   */
  private async handleError(
    calendarLinkId: string,
    e: unknown,
    target:
      | { id: string }
      | {
          occurrenceId: string;
          calendarLinkId: string;
          googleCalendarId: string;
          googleEventId: string;
        },
  ): Promise<{ blocked?: CalendarErrorCode; rateLimited?: boolean }> {
    const err = asGoogleError(e);
    const blocked = blockingCode(err);
    if (blocked) {
      await this.block(calendarLinkId, blocked);
      return { blocked };
    }
    if (err.kind === 'rate_limited') return { rateLimited: true };

    this.logger.warn(`Calendar sync item failed: ${err.message}`);
    const existing =
      'id' in target
        ? await this.prisma.calendarEventLink.findUnique({ where: { id: target.id } })
        : await this.prisma.calendarEventLink.findUnique({
            where: { occurrenceId: target.occurrenceId },
          });
    const attempts = (existing?.attempts ?? 0) + 1;
    const data = {
      syncStatus: 'ERROR' as const,
      attempts,
      lastErrorCode: err.kind,
      nextAttemptAt: attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + backoffMs(attempts)),
    };
    if (existing) await this.prisma.calendarEventLink.update({ where: { id: existing.id }, data });
    else if (!('id' in target))
      await this.prisma.calendarEventLink.create({ data: { ...target, ...data } });
    return {};
  }

  /** Erreur bloquante : lien invalide + notification (une seule fois par changement d'état). */
  private async block(calendarLinkId: string, code: CalendarErrorCode) {
    const link = await this.prisma.householdCalendarLink.findUniqueOrThrow({
      where: { id: calendarLinkId },
    });
    if (link.status === 'INVALID' && link.lastErrorCode === code) return;
    await this.prisma.householdCalendarLink.update({
      where: { id: calendarLinkId },
      data: { status: 'INVALID', lastErrorCode: code },
    });
    const members = await this.prisma.householdMember.findMany({
      where: { householdId: link.householdId, leftAt: null, userId: { not: null } },
      select: { id: true },
    });
    await this.prisma.notification.createMany({
      data: members.map((m) => ({
        memberId: m.id,
        type: 'CALENDAR_SYNC_FAILED' as const,
        payload: { code },
      })),
    });
    void this.push.wakeMembers(
      link.householdId,
      members.map((m) => m.id),
    );
    this.logger.warn(`Calendar link ${calendarLinkId} blocked: ${code}`);
  }

  // ───────────── Réconciliation ─────────────

  /**
   * Compare Google et la base (via extendedProperties, jamais les titres) :
   * - événement supprimé dans Google ⇒ occurrence « détachée », non recréée (A7) ;
   * - doublon (même occurrence, autre identifiant) ⇒ supprimé ;
   * - événement orphelin (occurrence disparue) ⇒ supprimé ;
   * - événement absent alors qu'il devrait exister ⇒ recréé au prochain balayage.
   */
  async reconcile(
    householdId: string,
  ): Promise<{ orphans: number; duplicates: number; detached: number; missing: number }> {
    const stats = { orphans: 0, duplicates: 0, detached: 0, missing: 0 };
    const link = await this.prisma.householdCalendarLink.findUnique({
      where: { householdId },
      include: { household: true },
    });
    if (!link || link.status !== 'ACTIVE') return stats;
    const tz = link.household.timezone;
    const today = todayIn(tz);
    const from = addDays(today, -SYNC_PAST_DAYS);
    const to = addDays(today, SYNC_FUTURE_DAYS);

    try {
      const events = await this.tokens.withToken(link.connectionId, (token) =>
        this.google.listAppEvents(token, link.googleCalendarId, {
          householdId,
          timeMin: new Date(`${from}T00:00:00Z`).toISOString(),
          timeMax: new Date(`${addDays(to, 1)}T23:59:59Z`).toISOString(),
        }),
      );
      const links = await this.prisma.calendarEventLink.findMany({
        where: { calendarLinkId: link.id },
        include: { occurrence: { include: occurrenceInclude } },
      });
      const byEventId = new Map(links.map((l) => [l.googleEventId, l]));
      const seen = new Set<string>();

      for (const ev of events) {
        seen.add(ev.id);
        const occurrenceId = ev.extendedProperties?.private?.gnOccurrenceId;
        const l = byEventId.get(ev.id);
        if (ev.status === 'cancelled') {
          if (l && l.syncStatus === 'SYNCED') {
            await this.prisma.calendarEventLink.update({
              where: { id: l.id },
              data: { syncStatus: 'DELETED', lastErrorCode: DELETED_IN_GOOGLE },
            });
            stats.detached++;
          }
          continue;
        }
        const canonical = occurrenceId ? eventIdFor(occurrenceId) : null;
        const occurrence =
          l?.occurrence ??
          (occurrenceId
            ? await this.prisma.taskOccurrence.findUnique({
                where: { id: occurrenceId },
                include: occurrenceInclude,
              })
            : null);
        const shouldExist = occurrence && eligible(occurrence);
        if (!occurrence) {
          // Occurrence inconnue (supprimée définitivement, ou foyer recréé) : orphelin.
          await this.deleteRemote(link.connectionId, link.googleCalendarId, ev.id);
          stats.orphans++;
        } else if (ev.id !== canonical) {
          // Même occurrence sous un autre identifiant : doublon, seul l'événement canonique reste.
          await this.deleteRemote(link.connectionId, link.googleCalendarId, ev.id);
          stats.duplicates++;
        } else if (
          !shouldExist ||
          (l && l.syncStatus === 'DELETED' && l.lastErrorCode !== DELETED_IN_GOOGLE)
        ) {
          await this.deleteRemote(link.connectionId, link.googleCalendarId, ev.id);
          stats.orphans++;
        } else if (!l) {
          // Événement créé mais mapping perdu (crash, reconnexion) : on l'adopte, il sera mis à jour.
          await this.prisma.calendarEventLink.upsert({
            where: { occurrenceId: occurrence!.id },
            create: {
              occurrenceId: occurrence!.id,
              calendarLinkId: link.id,
              googleCalendarId: link.googleCalendarId,
              googleEventId: ev.id,
              syncStatus: 'PENDING',
            },
            update: {
              calendarLinkId: link.id,
              googleCalendarId: link.googleCalendarId,
              googleEventId: ev.id,
              syncStatus: 'PENDING',
              lastErrorCode: null,
            },
          });
        }
      }

      // Mapping « synchronisé » mais événement introuvable dans Google : à recréer.
      for (const l of links) {
        const date = fromDbDate(l.occurrence?.date ?? null);
        if (
          l.syncStatus === 'SYNCED' &&
          !seen.has(l.googleEventId) &&
          date &&
          date >= from &&
          date <= to
        ) {
          await this.prisma.calendarEventLink.update({
            where: { id: l.id },
            data: { syncStatus: 'PENDING' },
          });
          stats.missing++;
        }
      }
      await this.prisma.householdCalendarLink.update({
        where: { id: link.id },
        data: { lastReconciledAt: new Date() },
      });
    } catch (e) {
      const err = asGoogleError(e);
      // Liste impossible : le calendrier lui-même a disparu ou n'est plus accessible.
      const blocked = err.kind === 'not_found' ? 'CALENDAR_NOT_FOUND' : blockingCode(err);
      if (blocked) await this.block(link.id, blocked);
      throw err;
    }
    return stats;
  }

  private async deleteRemote(connectionId: string, calendarId: string, eventId: string) {
    await this.tokens.withToken(connectionId, async (token) => {
      try {
        await this.google.deleteEvent(token, calendarId, eventId);
      } catch (e) {
        if (!(e instanceof GoogleApiError && e.kind === 'not_found')) throw e;
      }
    });
  }

  /** Supprime tous nos événements d'un calendrier (déconnexion ou changement de calendrier). */
  async removeAllEvents(calendarLinkId: string): Promise<number> {
    const link = await this.prisma.householdCalendarLink.findUnique({
      where: { id: calendarLinkId },
    });
    if (!link) return 0;
    const links = await this.prisma.calendarEventLink.findMany({
      where: { calendarLinkId, syncStatus: { not: 'DELETED' } },
    });
    let removed = 0;
    for (const l of links) {
      try {
        await this.deleteRemote(link.connectionId, l.googleCalendarId, l.googleEventId);
        removed++;
      } catch (e) {
        this.logger.warn(
          `Could not remove event ${l.googleEventId}: ${e instanceof Error ? e.message : String(e)}`,
        );
        if (e instanceof GoogleApiError && !e.retryable) break; // droits / révocation : inutile d'insister
      }
    }
    return removed;
  }

  // ───────────── Contenu des événements ─────────────

  buildEvent(
    occ: SyncOccurrence,
    link: { householdId?: string; googleCalendarId: string },
    ctx: { tz: string; locale: 'fr' | 'en' },
  ): GoogleEvent {
    const t =
      ctx.locale === 'en'
        ? {
            together: 'together',
            assignee: 'Assignee',
            unassigned: 'Unassigned',
            open: 'Open in Agenda G & N',
          }
        : {
            together: 'à deux',
            assignee: 'Responsable',
            unassigned: 'À définir',
            open: 'Ouvrir dans Agenda G & N',
          };
    const title = occ.titleOverride ?? occ.task.title;
    const people = occ.assignees.map((a) => a.member.displayName);
    const who =
      people.length === 0 ? null : people.length === 1 ? people[0]! : `${people.join(' & ')}`;
    const summary = `${occ.status === 'DONE' ? '✓ ' : ''}${title}${who ? ` · ${people.length > 1 ? t.together : who}` : ''}`;
    const date = fromDbDate(occ.date)!;
    const url = `${env().WEB_ORIGIN}/calendar?view=day&date=${date}`;
    const description = `${t.assignee} : ${who ?? t.unassigned}\n\n${t.open} : ${url}`;

    let start: GoogleEvent['start'];
    let end: GoogleEvent['end'];
    if (occ.startMinute == null || !occ.startsAt) {
      start = { date };
      end = { date: addDays(date, 1) };
    } else {
      const minutes = occ.durationMinutes && occ.durationMinutes > 0 ? occ.durationMinutes : 30;
      start = { dateTime: occ.startsAt.toISOString(), timeZone: ctx.tz };
      end = {
        dateTime: new Date(occ.startsAt.getTime() + minutes * 60_000).toISOString(),
        timeZone: ctx.tz,
      };
    }
    return {
      id: eventIdFor(occ.id),
      summary: summary.slice(0, 1000),
      description,
      start,
      end,
      transparency: 'transparent',
      // Les rappels viennent de l'application, pas de Google.
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: {
        private: {
          gnApp: 'agenda-gn',
          gnHouseholdId: occ.householdId,
          gnOccurrenceId: occ.id,
          gnTaskId: occ.taskId,
        },
      },
    };
  }
}
