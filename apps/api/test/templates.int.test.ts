import { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Modèles de tâches et historique « fait par »', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('créer, appliquer à une date (responsables, heures, liste), modifier, supprimer', async () => {
    const h = await coupleHousehold(app);
    const created = await http()
      .post(`${h.base}/templates`)
      .set(h.grace.auth)
      .send({
        name: 'Ménage du samedi',
        emoji: '🧹',
        items: [
          {
            title: 'Aspirateur',
            assigneeIds: [h.nicolas.memberId],
            startMinute: 600,
            durationMinutes: 30,
          },
          { title: 'Salle de bain', assigneeIds: [h.grace.memberId] },
          { title: 'Draps', checklist: ['Chambre', "Chambre d'amis"] },
        ],
      })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Ménage du samedi', emoji: '🧹' });

    const saturday = addDays(today, 3);
    const applied = await http()
      .post(`${h.base}/templates/${created.body.id}/apply`)
      .set(h.grace.auth)
      .send({ date: saturday })
      .expect(201);
    expect(applied.body).toHaveLength(3);
    expect(applied.body[0]).toMatchObject({
      title: 'Aspirateur',
      date: saturday,
      startMinute: 600,
      durationMinutes: 30,
      assigneeIds: [h.nicolas.memberId],
    });
    expect(applied.body[2].checklist.map((i: { text: string }) => i.text)).toEqual([
      'Chambre',
      "Chambre d'amis",
    ]);

    // Sans date : tâches « à planifier », sans heure.
    const undated = await http()
      .post(`${h.base}/templates/${created.body.id}/apply`)
      .set(h.nicolas.auth)
      .send({})
      .expect(201);
    expect(undated.body[0]).toMatchObject({ date: null, startMinute: null });

    await http()
      .put(`${h.base}/templates/${created.body.id}`)
      .set(h.nicolas.auth)
      .send({ name: 'Ménage', items: [{ title: 'Aspirateur' }] })
      .expect(200);
    const list = await http().get(`${h.base}/templates`).set(h.grace.auth).expect(200);
    expect(list.body.map((t: { name: string }) => t.name)).toEqual(['Ménage']);
    await http().delete(`${h.base}/templates/${created.body.id}`).set(h.grace.auth).expect(204);
    expect((await http().get(`${h.base}/templates`).set(h.grace.auth)).body).toEqual([]);
  });

  it('isolation et validation', async () => {
    const h = await coupleHousehold(app);
    const other = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/templates`)
      .set(h.grace.auth)
      .send({ name: 'Courses', items: [{ title: 'Pain' }] })
      .expect(201);
    await http()
      .post(`${other.base}/templates/${t.body.id}/apply`)
      .set(other.grace.auth)
      .send({})
      .expect(404);
    await http()
      .post(`${h.base}/templates`)
      .set(h.grace.auth)
      .send({ name: 'Vide', items: [] })
      .expect(400);
  });

  it('historique d’une tâche récurrente : qui l’a faite, quand, combien de fois', async () => {
    const h = await coupleHousehold(app);
    const task = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({
        title: 'Poubelles',
        date: addDays(today, -14),
        recurrence: {
          rule: {
            freq: 'WEEKLY',
            interval: 1,
            byWeekday: [
              ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][
                (new Date(`${addDays(today, -14)}T12:00:00Z`).getUTCDay() + 6) % 7
              ],
            ],
          },
          rotation: { mode: 'ALTERNATE', memberIds: [h.grace.memberId, h.nicolas.memberId] },
        },
      })
      .expect(201);
    const seriesId = task.body.seriesId as string;
    const occurrences = await http()
      .get(`${h.base}/occurrences?view=all&from=${addDays(today, -14)}&to=${addDays(today, -1)}`)
      .set(h.grace.auth);
    const [first, second] = occurrences.body as { id: string }[];
    await http().post(`${h.base}/occurrences/${first!.id}/complete`).set(h.grace.auth).expect(200);
    await http()
      .post(`${h.base}/occurrences/${second!.id}/complete`)
      .set(h.nicolas.auth)
      .expect(200);

    const history = await http()
      .get(`${h.base}/series/${seriesId}/history`)
      .set(h.grace.auth)
      .expect(200);
    expect(
      history.body.items.map((i: { completedById: string | null }) => i.completedById),
    ).toEqual([h.nicolas.memberId, h.grace.memberId]);
    expect(history.body.doneBy).toEqual(
      expect.arrayContaining([
        { memberId: h.grace.memberId, count: 1 },
        { memberId: h.nicolas.memberId, count: 1 },
      ]),
    );
    const other = await coupleHousehold(app);
    await http().get(`${other.base}/series/${seriesId}/history`).set(other.grace.auth).expect(404);
  });
});
