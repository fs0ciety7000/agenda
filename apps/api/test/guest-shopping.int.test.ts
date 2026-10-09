import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Liste de courses pour un invité', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('lien en lecture seule, sans compte, remplaçable et révocable', async () => {
    const h = await coupleHousehold(app);
    await http().post(`${h.base}/shopping`).set(h.grace.auth).send({ text: '2 kg de pommes' });
    const milk = await http().post(`${h.base}/shopping`).set(h.nicolas.auth).send({ text: 'lait' });
    await http()
      .patch(`${h.base}/shopping/${milk.body.id}`)
      .set(h.grace.auth)
      .send({ done: true })
      .expect(200);

    expect(
      (await http().get(`${h.base}/shopping-guest`).set(h.grace.auth).expect(200)).body,
    ).toEqual({ url: null, createdAt: null, createdById: null });
    const created = await http().post(`${h.base}/shopping-guest`).set(h.grace.auth).expect(200);
    expect(created.body.url).toMatch(/\/guest\/[a-f0-9]{40}$/);
    expect(created.body.createdById).toBe(h.grace.memberId);
    // L'autre membre voit le même lien (un par foyer).
    const seen = await http().get(`${h.base}/shopping-guest`).set(h.nicolas.auth).expect(200);
    expect(seen.body.url).toBe(created.body.url);

    const token = (created.body.url as string).split('/').pop()!;
    const view = await http().get(`/v1/guest/shopping/${token}`).expect(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.body.householdName).toBeTruthy();
    expect(view.body.items).toEqual([
      expect.objectContaining({ text: 'pommes', quantity: '2 kg', aisle: 'PRODUCE', done: false }),
      expect.objectContaining({ text: 'lait', done: true }),
    ]);
    // Rien de plus que la liste : ni membres ni dates.
    expect(Object.keys(view.body.items[0]).sort()).toEqual([
      'aisle',
      'done',
      'id',
      'quantity',
      'text',
    ]);
    // Lecture seule : aucune route d'écriture derrière le jeton.
    await http().post(`/v1/guest/shopping/${token}`).send({ text: 'bonbons' }).expect(404);

    // Remplacé : l'ancien lien ne marche plus ; coupé : plus rien.
    const renewed = await http().post(`${h.base}/shopping-guest`).set(h.nicolas.auth).expect(200);
    await http().get(`/v1/guest/shopping/${token}`).expect(404);
    const token2 = (renewed.body.url as string).split('/').pop()!;
    await http().get(`/v1/guest/shopping/${token2}`).expect(200);
    await http().delete(`${h.base}/shopping-guest`).set(h.grace.auth).expect(204);
    await http().get(`/v1/guest/shopping/${token2}`).expect(404);
    await http().get('/v1/guest/shopping/pas-un-jeton').expect(404);
  });

  it('un autre foyer ne peut ni lire ni créer le lien', async () => {
    const h = await coupleHousehold(app);
    const other = await coupleHousehold(app);
    await http().post(`${h.base}/shopping-guest`).set(h.grace.auth).expect(200);
    for (const res of [
      await http().get(`${h.base}/shopping-guest`).set(other.grace.auth),
      await http().post(`${h.base}/shopping-guest`).set(other.grace.auth),
      await http().delete(`${h.base}/shopping-guest`).set(other.grace.auth),
    ]) {
      expect([403, 404]).toContain(res.status);
    }
    await http().get(`${h.base}/shopping-guest`).expect(401);
  });

  it("l'export RGPD indique le lien créé, sans le jeton", async () => {
    const h = await coupleHousehold(app);
    const created = await http().post(`${h.base}/shopping-guest`).set(h.grace.auth).expect(200);
    const token = (created.body.url as string).split('/').pop()!;
    const exported = await http().get('/v1/me/export').set(h.grace.auth).expect(200);
    const text = JSON.stringify(exported.body);
    expect(text).not.toContain(token);
    expect(exported.body.households[0].guestShoppingLinkCreatedAt).toBeTruthy();
  });
});
