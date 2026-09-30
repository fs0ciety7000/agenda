import { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Menus de la semaine', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('prévoir, modifier, envoyer aux courses sans doublon, suggestions, supprimer', async () => {
    const h = await coupleHousehold(app);
    await http().post(`${h.base}/shopping`).set(h.grace.auth).send({ text: 'Tomates' }).expect(201);

    const lasagnes = await http()
      .post(`${h.base}/meals`)
      .set(h.grace.auth)
      .send({
        date: today,
        slot: 'DINNER',
        title: 'Lasagnes',
        ingredients: ['Tomates', '500 g de bœuf haché', 'Pâtes à lasagne'],
      })
      .expect(201);
    const salade = await http()
      .post(`${h.base}/meals`)
      .set(h.nicolas.auth)
      .send({
        date: addDays(today, 1),
        slot: 'LUNCH',
        title: 'Salade',
        ingredients: ['tomate', 'Feta'],
      })
      .expect(201);

    const week = await http()
      .get(`${h.base}/meals?from=${today}&to=${addDays(today, 6)}`)
      .set(h.grace.auth)
      .expect(200);
    expect(week.body.map((m: { title: string }) => m.title)).toEqual(['Lasagnes', 'Salade']);

    const sent = await http()
      .post(`${h.base}/meals/shopping`)
      .set(h.grace.auth)
      .send({ mealIds: [lasagnes.body.id, salade.body.id] })
      .expect(200);
    // « Tomates » déjà sur la liste, « tomate » = même produit.
    expect(sent.body).toEqual({ added: 3, skipped: 2 });
    const list = await http().get(`${h.base}/shopping`).set(h.grace.auth).expect(200);
    expect(list.body.map((i: { text: string }) => i.text.toLowerCase()).sort()).toEqual([
      'bœuf haché',
      'feta',
      'pâtes à lasagne',
      'tomates',
    ]);

    const edited = await http()
      .patch(`${h.base}/meals/${salade.body.id}`)
      .set(h.grace.auth)
      .send({ title: 'Salade grecque' })
      .expect(200);
    expect(edited.body).toMatchObject({
      title: 'Salade grecque',
      addedToShoppingAt: expect.any(String),
    });

    const suggestions = await http()
      .get(`${h.base}/meals/suggestions`)
      .set(h.grace.auth)
      .expect(200);
    expect(suggestions.body.map((s: { title: string }) => s.title)).toContain('Lasagnes');

    await http().delete(`${h.base}/meals/${lasagnes.body.id}`).set(h.nicolas.auth).expect(204);
    await http()
      .get(`${h.base}/meals?from=${today}&to=${addDays(today, 90)}`)
      .set(h.grace.auth)
      .expect(400);
  });
});
