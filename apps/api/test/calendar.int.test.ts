import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIn, weekdayOf, WEEKDAYS } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GoogleCalendarSyncService, eventIdFor } from '../src/calendar/calendar-sync.service';
import { GoogleCalendarClient } from '../src/calendar/google-calendar.client';
import { coupleHousehold, createTestApp, registerUser } from './app';
import { FakeGoogleCalendar } from '../src/calendar/fake-google-calendar';

const COMMUN = 'commun-gn@group.calendar.google.com';

describe('Google Calendar — connexion, synchronisation, erreurs (intégration)', () => {
  let app: INestApplication;
  let sync: GoogleCalendarSyncService;
  const google = new FakeGoogleCalendar();
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');
  const WD = WEEKDAYS[weekdayOf(today)]!;

  beforeAll(async () => {
    app = await createTestApp([{ provide: GoogleCalendarClient, useValue: google }]);
    sync = app.get(GoogleCalendarSyncService);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Foyer + connexion Google de Nicolas + calendrier « Commun G & N » choisi. */
  async function setup(opts: { link?: boolean } = {}) {
    const h = await coupleHousehold(app);
    const calendarId = `${COMMUN}-${h.householdId}`;
    google.addCalendar(calendarId, 'Commun G & N', 'owner');
    google.addCalendar(`perso-${h.householdId}`, 'Nicolas (perso)', 'owner');
    google.addCalendar(`ro-${h.householdId}`, 'Anniversaires', 'reader');
    const email = `nicolas.${h.householdId.slice(0, 8)}@gmail.test`;
    await connect(h.nicolas.auth, `sub-${h.householdId}`, email);
    if (opts.link !== false) {
      await http()
        .put(`${h.base}/calendar/link`)
        .set(h.nicolas.auth)
        .send({ calendarId })
        .expect(200);
    }
    const events = () => google.events(calendarId);
    const occurrences = async (qs = `from=${today}&to=${addDays(today, 60)}`) =>
      (await http().get(`${h.base}/occurrences?${qs}`).set(h.grace.auth).expect(200)).body as {
        id: string;
        version: number;
        date: string;
        calendarSync: string | null;
        seriesId: string | null;
      }[];
    return { ...h, calendarId, email, events, occurrences, sweep: () => sync.sweep(h.householdId) };
  }

  async function connect(auth: Record<string, string>, sub: string, email: string) {
    const start = await http()
      .get('/v1/calendar/google/connect?next=/settings')
      .set(auth)
      .expect(302);
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const flow = (start.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('gn_cal_oauth='))!
      .split(';')[0]!;
    const res = await http()
      .get(
        `/v1/calendar/google/callback?code=${encodeURIComponent(`${sub}|${email}`)}&state=${state}`,
      )
      .set('Cookie', flow)
      .expect(302);
    expect(res.headers.location).toBe('/settings?calendar=connected');
  }

  const weeklyTask = (h: Awaited<ReturnType<typeof setup>>, extra: object = {}) =>
    http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({
        title: 'Nettoyer la salle de bain',
        date: today,
        startMinute: 600,
        durationMinutes: 45,
        syncToCalendar: true,
        recurrence: {
          rule: { freq: 'WEEKLY', byWeekday: [WD] },
          rotation: { mode: 'ALTERNATE', memberIds: [h.grace.memberId, h.nicolas.memberId] },
        },
        ...extra,
      })
      .expect(201);

  describe('connexion et choix du calendrier', () => {
    it('OAuth : jetons chiffrés en base, jamais exposés ; statut lisible', async () => {
      const h = await setup({ link: false });
      const conn = await prisma.googleConnection.findFirstOrThrow({ where: { email: h.email } });
      expect(conn.refreshTokenEnc.startsWith('v1:')).toBe(true);
      expect(conn.refreshTokenEnc).not.toContain('rt-');
      const status = await http().get(`${h.base}/calendar`).set(h.nicolas.auth).expect(200);
      expect(status.body).toMatchObject({
        configured: true,
        connection: { email: h.email, status: 'ACTIVE' },
        link: null,
      });
      expect(JSON.stringify(status.body)).not.toMatch(/rt-|at-|Enc/);
      // Grace n'a pas (encore) connecté son propre compte Google.
      const grace = await http().get(`${h.base}/calendar`).set(h.grace.auth).expect(200);
      expect(grace.body.connection).toBeNull();
    });

    it('liste les calendriers ; seul un calendrier modifiable peut être choisi', async () => {
      const h = await setup({ link: false });
      const list = await http().get(`${h.base}/calendar/available`).set(h.nicolas.auth).expect(200);
      const byName = Object.fromEntries(list.body.map((c: { summary: string }) => [c.summary, c]));
      expect(byName['Commun G & N']).toMatchObject({ id: h.calendarId, writable: true });
      expect(byName['Anniversaires']).toMatchObject({ writable: false, accessRole: 'reader' });

      const ro = await http()
        .put(`${h.base}/calendar/link`)
        .set(h.nicolas.auth)
        .send({ calendarId: `ro-${h.householdId}` })
        .expect(403);
      expect(ro.body.error.code).toBe('CALENDAR_READ_ONLY');
      const missing = await http()
        .put(`${h.base}/calendar/link`)
        .set(h.nicolas.auth)
        .send({ calendarId: 'nope' })
        .expect(404);
      expect(missing.body.error.code).toBe('CALENDAR_NOT_FOUND');
      const noConn = await http().get(`${h.base}/calendar/available`).set(h.grace.auth).expect(409);
      expect(noConn.body.error.code).toBe('CALENDAR_NOT_CONNECTED');

      const linked = await http()
        .put(`${h.base}/calendar/link`)
        .set(h.nicolas.auth)
        .send({ calendarId: h.calendarId })
        .expect(200);
      expect(linked.body.link).toMatchObject({
        calendarId: h.calendarId,
        summary: 'Commun G & N',
        status: 'ACTIVE',
        connectedBy: 'Nicolas',
        connectedByMe: true,
      });
      // Grace voit le calendrier partagé du foyer, connecté par Nicolas.
      const seenByGrace = await http().get(`${h.base}/calendar`).set(h.grace.auth).expect(200);
      expect(seenByGrace.body.link).toMatchObject({
        summary: 'Commun G & N',
        connectedByMe: false,
        connectedBy: 'Nicolas',
      });
    });

    it('ISOLATION : statut et liaison inaccessibles depuis un autre foyer', async () => {
      const h = await setup();
      const stranger = await registerUser(app, 'Voisin');
      await http().get(`${h.base}/calendar`).set(stranger.auth).expect(404);
      await http()
        .put(`${h.base}/calendar/link`)
        .set(stranger.auth)
        .send({ calendarId: h.calendarId })
        .expect(404);
      await http().delete(`${h.base}/calendar/link`).set(stranger.auth).expect(404);
    });
  });

  describe('synchronisation', () => {
    it('tâche récurrente avec rotation : un événement par occurrence, titres et horaires corrects', async () => {
      const h = await setup();
      const created = await weeklyTask(h);
      expect(created.body).toMatchObject({ syncToCalendar: true, calendarSync: 'PENDING' });
      const r = await h.sweep();
      expect(r).toMatchObject({ created: 9, failed: 0 }); // J, J+7 … J+56 (fenêtre de 60 jours)
      const events = h
        .events()
        .sort((a, b) => a.start!.dateTime!.localeCompare(b.start!.dateTime!));
      expect(events).toHaveLength(9);
      expect(events.map((e) => e.summary)).toEqual(
        Array.from(
          { length: 9 },
          (_, i) => `Nettoyer la salle de bain · ${i % 2 === 0 ? 'Grace' : 'Nicolas'}`,
        ),
      );
      const first = events[0]!;
      expect(first.id).toBe(eventIdFor(created.body.id));
      expect(first.start).toMatchObject({ timeZone: 'Europe/Brussels' });
      expect(
        new Date(first.end!.dateTime!).getTime() - new Date(first.start!.dateTime!).getTime(),
      ).toBe(45 * 60_000);
      expect(first.extendedProperties!.private).toMatchObject({
        gnHouseholdId: h.householdId,
        gnOccurrenceId: created.body.id,
        gnApp: 'agenda-gn',
      });
      expect(first.reminders).toEqual({ useDefault: false, overrides: [] });
      expect((await h.occurrences())[0]!.calendarSync).toBe('SYNCED');

      // Idempotent : un second balayage ne fait aucun appel d'écriture.
      google.calls = [];
      expect(await h.sweep()).toMatchObject({ created: 0, updated: 0, deleted: 0 });
      expect(google.calls.filter((c) => c.startsWith('events.'))).toEqual([]);
    });

    it('modifier UNE occurrence ⇒ un seul événement mis à jour ; cocher ⇒ préfixe ✓', async () => {
      const h = await setup();
      await weeklyTask(h);
      await h.sweep();
      const [first, second] = await h.occurrences();
      await http()
        .patch(`${h.base}/occurrences/${second!.id}?scope=this`)
        .set(h.grace.auth)
        .send({ version: second!.version, startMinute: 840 })
        .expect(200);
      await http()
        .post(`${h.base}/occurrences/${first!.id}/complete`)
        .set(h.grace.auth)
        .expect(200);
      google.calls = [];
      expect(await h.sweep()).toMatchObject({ created: 0, updated: 2 });
      expect(google.calls.filter((c) => c === 'events.patch')).toHaveLength(2);
      const byId = new Map(h.events().map((e) => [e.id, e]));
      expect(byId.get(eventIdFor(first!.id))!.summary).toBe('✓ Nettoyer la salle de bain · Grace');
      expect(new Date(byId.get(eventIdFor(second!.id))!.start!.dateTime!).toISOString()).toMatch(
        /T1[23]:00:00/,
      );
    });

    it('supprimer une occurrence, puis les suivantes ⇒ événements supprimés', async () => {
      const h = await setup();
      await weeklyTask(h);
      await h.sweep();
      const occs = await h.occurrences();
      await http()
        .delete(`${h.base}/occurrences/${occs[1]!.id}?scope=this`)
        .set(h.grace.auth)
        .expect(204);
      expect(await h.sweep()).toMatchObject({ deleted: 1 });
      expect(h.events()).toHaveLength(8);
      await http()
        .delete(`${h.base}/occurrences/${occs[3]!.id}?scope=following`)
        .set(h.grace.auth)
        .expect(204);
      await h.sweep();
      expect(
        h
          .events()
          .map((e) => e.id)
          .sort(),
      ).toEqual([eventIdFor(occs[0]!.id), eventIdFor(occs[2]!.id)].sort());
    });

    it('« celle-ci et les suivantes » : anciens événements retirés, nouveaux créés, passé intact', async () => {
      const h = await setup();
      await weeklyTask(h);
      await h.sweep();
      const occs = await h.occurrences();
      const res = await http()
        .patch(`${h.base}/occurrences/${occs[2]!.id}?scope=following`)
        .set(h.grace.auth)
        .send({ version: occs[2]!.version, title: 'Salle de bain + miroirs' })
        .expect(200);
      await h.sweep();
      const summaries = h.events().map((e) => e.summary!.split(' · ')[0]);
      expect(summaries.filter((s) => s === 'Nettoyer la salle de bain')).toHaveLength(2);
      expect(summaries.filter((s) => s === 'Salle de bain + miroirs')).toHaveLength(7);
      expect(h.events().some((e) => e.id === eventIdFor(res.body.id))).toBe(true);
    });

    it('tâche personnelle ou non cochée : jamais publiée ; décocher retire les événements', async () => {
      const h = await setup();
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Secret', visibility: 'PERSONAL', syncToCalendar: true, date: today })
        .expect(201);
      const plain = await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Non publiée', date: today })
        .expect(201);
      expect(plain.body).toMatchObject({ syncToCalendar: false, calendarSync: null });
      const shared = await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Publiée', date: today, syncToCalendar: true })
        .expect(201);
      await h.sweep();
      expect(h.events().map((e) => e.summary)).toEqual(['Publiée']);
      expect(h.events()[0]!.start).toEqual({ date: today }); // sans heure : journée entière
      await http()
        .patch(`${h.base}/occurrences/${shared.body.id}`)
        .set(h.grace.auth)
        .send({ version: 1, syncToCalendar: false })
        .expect(200);
      await h.sweep();
      expect(h.events()).toEqual([]);
    });

    it('DOUBLONS : crash après la création côté Google (mapping perdu) ⇒ aucun doublon', async () => {
      const h = await setup();
      const t = await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Courses', date: today, startMinute: 1080, syncToCalendar: true })
        .expect(201);
      await h.sweep();
      await prisma.calendarEventLink.deleteMany({ where: { occurrenceId: t.body.id } }); // « crash » avant l'écriture en base
      await http()
        .patch(`${h.base}/occurrences/${t.body.id}`)
        .set(h.grace.auth)
        .send({ version: 1, title: 'Courses (Delhaize)' })
        .expect(200);
      await h.sweep();
      expect(h.events()).toHaveLength(1);
      expect(h.events()[0]!.summary).toBe('Courses (Delhaize)');
      expect(google.calls).toContain('events.insert');
    });

    it('JETON EXPIRÉ : renouvellement automatique puis succès', async () => {
      const h = await setup();
      google.expireAccessTokens(); // Google rejette les jetons d'accès actuels (401)
      google.calls = [];
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Vidange', date: today, syncToCalendar: true })
        .expect(201);
      expect(await h.sweep()).toMatchObject({ created: 1, failed: 0 });
      expect(google.calls).toContain('token.refresh');
    });

    it('RÉVOCATION puis RECONNEXION : synchro bloquée avec un message clair, puis reprise', async () => {
      const h = await setup();
      google.revokeUser(h.email);
      google.expireAccessTokens();
      await prisma.googleConnection.updateMany({
        where: { email: h.email },
        data: { accessTokenExpiresAt: new Date(0) },
      });
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Lessive', date: today, syncToCalendar: true })
        .expect(201);
      expect(await h.sweep()).toMatchObject({ blocked: 'GOOGLE_REVOKED' });
      const status = await http().get(`${h.base}/calendar`).set(h.grace.auth).expect(200);
      expect(status.body.link).toMatchObject({ status: 'INVALID', errorCode: 'GOOGLE_REVOKED' });
      expect(
        await prisma.notification.count({
          where: { member: { householdId: h.householdId }, type: 'CALENDAR_SYNC_FAILED' },
        }),
      ).toBe(2);
      expect(await h.sweep()).toMatchObject({ created: 0 }); // rien tant que non reconnecté

      await connect(h.nicolas.auth, `sub-${h.householdId}`, h.email);
      const after = await http().get(`${h.base}/calendar`).set(h.grace.auth).expect(200);
      expect(after.body.link).toMatchObject({ status: 'ACTIVE', errorCode: null });
      expect(await h.sweep()).toMatchObject({ created: 1 });
    });

    it('CALENDRIER SUPPRIMÉ ou DROITS RETIRÉS : lien invalide, erreur compréhensible', async () => {
      const h = await setup();
      google.calendars.get(h.calendarId)!.entry.accessRole = 'reader';
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'x', date: today, syncToCalendar: true })
        .expect(201);
      expect(await h.sweep()).toMatchObject({ blocked: 'CALENDAR_READ_ONLY' });

      const h2 = await setup();
      google.calendars.delete(h2.calendarId);
      await http()
        .post(`${h2.base}/tasks`)
        .set(h2.grace.auth)
        .send({ title: 'y', date: today, syncToCalendar: true })
        .expect(201);
      expect(await h2.sweep()).toMatchObject({ blocked: 'CALENDAR_NOT_FOUND' });
      expect((await http().get(`${h2.base}/calendar`).set(h2.grace.auth)).body.link.errorCode).toBe(
        'CALENDAR_NOT_FOUND',
      );
    });

    it('QUOTA puis PANNE TEMPORAIRE : nouvelle tentative différée, sans perte', async () => {
      const h = await setup();
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'A', date: today, syncToCalendar: true })
        .expect(201);
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'B', date: today, syncToCalendar: true })
        .expect(201);
      google.failNext('events.insert', 'rate_limited');
      const limited = await h.sweep();
      expect(limited.retryInMs).toBeGreaterThan(0);
      expect(h.events()).toHaveLength(0);

      google.failNext('events.insert', 'server');
      const partial = await h.sweep();
      expect(partial).toMatchObject({ created: 1, failed: 1 });
      expect(partial.retryInMs).toBeGreaterThan(0);
      const failed = await prisma.calendarEventLink.findFirstOrThrow({
        where: { calendarLink: { householdId: h.householdId }, syncStatus: 'ERROR' },
      });
      expect(failed).toMatchObject({ attempts: 1, lastErrorCode: 'server' });
      await prisma.calendarEventLink.update({
        where: { id: failed.id },
        data: { nextAttemptAt: new Date(Date.now() - 1000) },
      });
      expect(await h.sweep()).toMatchObject({ created: 1, failed: 0 });
      expect(h.events()).toHaveLength(2);
    });
  });

  describe('réconciliation (conflits local / Google)', () => {
    it('orphelin supprimé, doublon supprimé, suppression dans Google respectée, événement disparu recréé', async () => {
      const h = await setup();
      const a = await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'A', date: today, startMinute: 600, syncToCalendar: true })
        .expect(201);
      const b = await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'B', date: today, startMinute: 700, syncToCalendar: true })
        .expect(201);
      const c = await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'C', date: today, startMinute: 800, syncToCalendar: true })
        .expect(201);
      await h.sweep();
      const cal = google.calendars.get(h.calendarId)!;
      const base = cal.events.get(eventIdFor(a.body.id))!;
      // Orphelin (occurrence inconnue) et doublon (même occurrence, autre identifiant).
      cal.events.set('orphan1', {
        ...base,
        id: 'orphan1',
        extendedProperties: {
          private: {
            ...base.extendedProperties!.private,
            gnOccurrenceId: '00000000-0000-4000-8000-000000000999',
          },
        },
      });
      cal.events.set('dup1', { ...base, id: 'dup1' });
      // B supprimé par un utilisateur dans Google ; C purgé sans trace.
      cal.events.set(eventIdFor(b.body.id), {
        ...cal.events.get(eventIdFor(b.body.id))!,
        status: 'cancelled',
      });
      cal.events.delete(eventIdFor(c.body.id));

      const stats = await sync.reconcile(h.householdId);
      expect(stats).toEqual({ orphans: 1, duplicates: 1, detached: 1, missing: 1 });
      await h.sweep();
      expect(
        h
          .events()
          .map((e) => e.summary)
          .sort(),
      ).toEqual(['A', 'C']); // B n'est pas ressuscité (A7)
      expect(cal.events.get('orphan1')!.status).toBe('cancelled');
      expect(cal.events.get('dup1')!.status).toBe('cancelled');

      // Modifier B dans l'application le republie (l'application reste la source de vérité).
      await http()
        .patch(`${h.base}/occurrences/${b.body.id}`)
        .set(h.grace.auth)
        .send({ version: 1, title: 'B (reprogrammée)' })
        .expect(200);
      await h.sweep();
      expect(
        h
          .events()
          .map((e) => e.summary)
          .sort(),
      ).toEqual(['A', 'B (reprogrammée)', 'C']);
    });

    it('déconnexion du calendrier : nos événements sont retirés de Google', async () => {
      const h = await setup();
      await weeklyTask(h);
      await h.sweep();
      expect(h.events().length).toBe(9);
      await http().delete(`${h.base}/calendar/link`).set(h.grace.auth).expect(204);
      expect(h.events()).toEqual([]);
      expect((await http().get(`${h.base}/calendar`).set(h.grace.auth)).body.link).toBeNull();
    });

    it('déconnexion du compte Google : autorisation révoquée auprès de Google', async () => {
      const h = await setup();
      google.calls = [];
      await http().delete('/v1/me/google-calendar').set(h.nicolas.auth).expect(204);
      expect(google.calls).toContain('token.revoke');
      expect(await prisma.googleConnection.count({ where: { email: h.email } })).toBe(0);
    });
  });
});
