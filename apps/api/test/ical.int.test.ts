import { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Abonnement iCal', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('lien secret : tâches visibles (partagées + personnelles à soi), révocable', async () => {
    const h = await coupleHousehold(app);
    const tomorrow = addDays(today, 1);
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({
        title: 'Dentiste, cabinet',
        date: tomorrow,
        startMinute: 9 * 60,
        durationMinutes: 45,
        assigneeIds: [h.grace.memberId],
      })
      .expect(201);
    await http()
      .post(`${h.base}/tasks`)
      .set(h.nicolas.auth)
      .send({ title: 'Cadeau secret', date: tomorrow, visibility: 'PERSONAL' })
      .expect(201);
    await http().post(`${h.base}/tasks`).set(h.grace.auth).send({ title: 'Sans date' }).expect(201);

    expect((await http().get(`${h.base}/ical`).set(h.grace.auth).expect(200)).body).toEqual({
      url: null,
    });
    const created = await http().post(`${h.base}/ical`).set(h.grace.auth).expect(200);
    const url = created.body.url as string;
    expect(url).toMatch(/\/v1\/ical\/[a-f0-9]{40}\.ics$/);
    const path = new URL(url).pathname;

    const res = await http().get(path).expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar/);
    expect(res.text).toContain('SUMMARY:Dentiste\\, cabinet · Grace');
    expect(res.text).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(res.text).not.toContain('Cadeau secret'); // tâche personnelle de Nicolas
    expect(res.text).not.toContain('Sans date');

    // Remplacée : l'ancienne adresse ne marche plus ; désactivée : plus rien.
    const renewed = await http().post(`${h.base}/ical`).set(h.grace.auth).expect(200);
    await http().get(path).expect(404);
    const newPath = new URL(renewed.body.url).pathname;
    await http().get(newPath).expect(200);
    await http().delete(`${h.base}/ical`).set(h.grace.auth).expect(204);
    await http().get(newPath).expect(404);
    await http().get('/v1/ical/pas-un-jeton.ics').expect(404);
  });
});
