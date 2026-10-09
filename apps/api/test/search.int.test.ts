import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Recherche globale', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('tâches, notes, dates, dépenses et courses ; jamais le personnel de l’autre', async () => {
    const h = await coupleHousehold(app);
    const today = new Date().toISOString().slice(0, 10);
    const g = h.grace.memberId;
    const n = h.nicolas.memberId;
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Réserver le garage', date: today })
      .expect(201);
    await http()
      .post(`${h.base}/tasks`)
      .set(h.nicolas.auth)
      .send({ title: 'Garage : cadeau surprise', visibility: 'PERSONAL' })
      .expect(201);
    await http()
      .post(`${h.base}/notes`)
      .set(h.nicolas.auth)
      .send({ title: 'Codes', body: 'Portail 4521, porte du garage 7788' })
      .expect(201);
    await http()
      .post(`${h.base}/important-dates`)
      .set(h.grace.auth)
      .send({ title: 'Révision garage', kind: 'MAINTENANCE', month: 3, day: 14 })
      .expect(201);
    await http()
      .post(`${h.base}/expenses`)
      .set(h.grace.auth)
      .send({
        paidById: g,
        amountCents: 4500,
        date: today,
        title: 'Garage vidange',
        split: 'SHARED',
      })
      .expect(201);
    await http()
      .post(`${h.base}/expenses`)
      .set(h.nicolas.auth)
      .send({
        paidById: n,
        amountCents: 900,
        date: today,
        title: 'Garage perso',
        split: 'PERSONAL',
      })
      .expect(201);
    await http()
      .post(`${h.base}/shopping`)
      .set(h.grace.auth)
      .send({ text: 'Liquide lave-glace (garage)' })
      .expect(201);

    const res = await http().get(`${h.base}/search?q=GARAGE`).set(h.grace.auth).expect(200);
    expect(res.body.tasks).toEqual([
      expect.objectContaining({ title: 'Réserver le garage', date: today, done: false }),
    ]);
    expect(res.body.notes).toEqual([
      expect.objectContaining({ title: 'Codes', snippet: expect.stringContaining('garage 7788') }),
    ]);
    expect(res.body.dates).toEqual([
      expect.objectContaining({ title: 'Révision garage', month: 3 }),
    ]);
    expect(res.body.expenses.map((e: { title: string }) => e.title)).toEqual(['Garage vidange']);
    expect(res.body.shopping).toEqual([
      expect.objectContaining({ text: 'Liquide lave-glace (garage)', done: false }),
    ]);

    // Nicolas voit sa tâche et sa dépense personnelles.
    const his = await http().get(`${h.base}/search?q=garage`).set(h.nicolas.auth).expect(200);
    expect(his.body.tasks).toHaveLength(2);
    expect(his.body.expenses).toHaveLength(2);

    // Requête trop courte, autre foyer, sans connexion.
    await http().get(`${h.base}/search?q=g`).set(h.grace.auth).expect(400);
    const other = await coupleHousehold(app);
    await http().get(`${h.base}/search?q=garage`).set(other.grace.auth).expect(404);
    await http().get(`${h.base}/search?q=garage`).expect(401);
  });
});
