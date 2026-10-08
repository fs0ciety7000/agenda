import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIn, weekdayOf } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp, registerUser } from './app';

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

describe('Notifications et statistiques (intégration)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const today = () => todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('notifications « tâche attribuée »', () => {
    it('attribuée par l’autre : notifiée ; par soi-même ou tâche personnelle : non', async () => {
      const h = await coupleHousehold(app);
      await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({ title: 'Sortir les poubelles', date: today(), assigneeIds: [h.grace.memberId] })
        .expect(201);
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Ma tâche', assigneeIds: [h.grace.memberId] })
        .expect(201);
      await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({ title: 'Perso de Nicolas', visibility: 'PERSONAL' })
        .expect(201);

      const grace = await http().get(`${h.base}/notifications`).set(h.grace.auth).expect(200);
      expect(grace.body.unread).toBe(1);
      expect(grace.body.items).toHaveLength(1);
      expect(grace.body.items[0]).toMatchObject({
        type: 'TASK_ASSIGNED',
        title: 'Sortir les poubelles',
        date: today(),
        byName: 'Nicolas',
        recurring: false,
        push: true,
        readAt: null,
      });
      const nicolas = await http().get(`${h.base}/notifications`).set(h.nicolas.auth).expect(200);
      expect(nicolas.body.items).toHaveLength(0);

      await http().post(`${h.base}/notifications/read`).set(h.grace.auth).send({}).expect(204);
      const after = await http().get(`${h.base}/notifications`).set(h.grace.auth).expect(200);
      expect(after.body.unread).toBe(0);
      expect(after.body.items[0].readAt).not.toBeNull();
    });

    it('changement de responsable : seul le nouveau responsable est notifié ; série : une seule notification', async () => {
      const h = await coupleHousehold(app);
      const task = await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Courses', date: today(), assigneeIds: [h.grace.memberId] })
        .expect(201);
      await http()
        .patch(`${h.base}/occurrences/${task.body.id}`)
        .set(h.grace.auth)
        .send({ version: task.body.version, assigneeIds: [h.nicolas.memberId] })
        .expect(200);
      const n = await http().get(`${h.base}/notifications`).set(h.nicolas.auth).expect(200);
      expect(n.body.items.map((i: { title: string }) => i.title)).toEqual(['Courses']);

      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({
          title: 'Salle de bain',
          date: today(),
          recurrence: {
            rule: { freq: 'WEEKLY', byWeekday: [WEEKDAYS[weekdayOf(today())]] },
            rotation: { mode: 'ALTERNATE', memberIds: [h.grace.memberId, h.nicolas.memberId] },
          },
        })
        .expect(201);
      const n2 = await http().get(`${h.base}/notifications`).set(h.nicolas.auth).expect(200);
      expect(n2.body.items).toHaveLength(2);
      expect(n2.body.items[0]).toMatchObject({ title: 'Salle de bain', recurring: true });
    });

    it('préférences : désactivée ⇒ plus de notification ; « téléphone » seul ⇒ pas dans la cloche', async () => {
      const h = await coupleHousehold(app);
      const prefs = await http()
        .get(`${h.base}/notification-preferences`)
        .set(h.grace.auth)
        .expect(200);
      expect(prefs.body).toEqual([
        { type: 'TASK_ASSIGNED', inApp: true, push: true },
        { type: 'CALENDAR_SYNC_FAILED', inApp: true, push: true },
        { type: 'TASK_COMMENT', inApp: true, push: true },
        { type: 'TASK_THANKS', inApp: true, push: true },
        { type: 'EXPENSE_BUDGET', inApp: true, push: true },
        { type: 'TASK_SWAP_REQUEST', inApp: true, push: true },
        { type: 'TASK_SWAP_ANSWER', inApp: true, push: true },
      ]);
      await http()
        .put(`${h.base}/notification-preferences`)
        .set(h.grace.auth)
        .send({ preferences: [{ type: 'TASK_ASSIGNED', inApp: false, push: false }] })
        .expect(200);
      await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({ title: 'Lessive', assigneeIds: [h.grace.memberId] })
        .expect(201);
      expect(await prisma.notification.count({ where: { memberId: h.grace.memberId } })).toBe(0);

      await http()
        .put(`${h.base}/notification-preferences`)
        .set(h.grace.auth)
        .send({ preferences: [{ type: 'TASK_ASSIGNED', inApp: false, push: true }] })
        .expect(200);
      await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({ title: 'Vaisselle', assigneeIds: [h.grace.memberId] })
        .expect(201);
      const list = await http().get(`${h.base}/notifications`).set(h.grace.auth).expect(200);
      expect(list.body.unread).toBe(0); // pas dans la cloche
      expect(list.body.items).toHaveLength(1); // mais transmise au téléphone
      expect(list.body.items[0].push).toBe(true);
    });

    it('ISOLATION : notifications d’un autre foyer inaccessibles', async () => {
      const h = await coupleHousehold(app);
      const stranger = await registerUser(app, 'Voisin');
      await http().get(`${h.base}/notifications`).set(stranger.auth).expect(404);
      await http().get(`${h.base}/stats`).set(stranger.auth).expect(404);
    });
  });

  describe('statistiques', () => {
    it('faites (par personne qui a coché, par catégorie, par jour), en retard, personnelles exclues', async () => {
      const h = await coupleHousehold(app);
      const cats = await http().get(`${h.base}/categories`).set(h.grace.auth).expect(200);
      const cleaning = cats.body.find((c: { name: string }) => c.name === 'Ménage');
      const make = async (title: string, date: string, extra: object = {}, who = h.grace) =>
        (
          await http()
            .post(`${h.base}/tasks`)
            .set(who.auth)
            .send({ title, date, durationMinutes: 30, startMinute: 600, ...extra })
            .expect(201)
        ).body;
      const a = await make('Salle de bain', today(), { categoryId: cleaning.id });
      const b = await make('Aspirateur', addDays(today(), -3), { categoryId: cleaning.id });
      const c = await make('Courses', today());
      await make('Pas encore faite', addDays(today(), -1));
      const personal = await make('Perso', today(), { visibility: 'PERSONAL' });
      for (const [o, who] of [
        [a, h.grace],
        [b, h.nicolas],
        [c, h.grace],
        [personal, h.grace],
      ] as const) {
        await http().post(`${h.base}/occurrences/${o.id}/complete`).set(who.auth).expect(200);
      }

      const s = await http().get(`${h.base}/stats?days=7`).set(h.nicolas.auth).expect(200);
      expect(s.body).toMatchObject({
        days: 7,
        to: today(),
        from: addDays(today(), -6),
        done: 3,
        doneMinutes: 90,
        doneLate: 1, // l'aspirateur, prévu il y a 3 jours
        overdue: 1,
      });
      expect(s.body.perDay).toHaveLength(7);
      expect(s.body.perDay.at(-1)).toEqual({ date: today(), done: 3 });
      expect(s.body.byCategory[0]).toMatchObject({ name: 'Ménage', done: 2, minutes: 60 });
      expect(s.body.byCategory[1]).toMatchObject({ categoryId: null, done: 1 });
      const byMember = Object.fromEntries(
        s.body.byMember.map((m: { memberId: string; done: number }) => [m.memberId, m.done]),
      );
      expect(byMember).toEqual({ [h.grace.memberId]: 2, [h.nicolas.memberId]: 1 });

      await http().get(`${h.base}/stats?days=12`).set(h.nicolas.auth).expect(400);
    });
  });
});
