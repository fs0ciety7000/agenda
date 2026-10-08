import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp, registerUser } from './app';

describe('Notes partagées', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('créer, lister (épinglées d’abord), modifier, supprimer ; visible par l’autre membre', async () => {
    const h = await coupleHousehold(app);
    const wifi = await http()
      .post(`${h.base}/notes`)
      .set(h.grace.auth)
      .send({ title: '  Wi-Fi  ', body: 'Réseau : Maison\nCode : 1234' })
      .expect(201);
    expect(wifi.body).toMatchObject({
      title: 'Wi-Fi',
      pinned: false,
      version: 1,
      createdById: h.grace.memberId,
    });
    await http()
      .post(`${h.base}/notes`)
      .set(h.nicolas.auth)
      .send({ title: 'Idées cadeaux', pinned: true })
      .expect(201);
    await http().post(`${h.base}/notes`).set(h.grace.auth).send({ title: '' }).expect(400);

    const list = await http().get(`${h.base}/notes`).set(h.nicolas.auth).expect(200);
    expect(list.body.map((n: { title: string }) => n.title)).toEqual(['Idées cadeaux', 'Wi-Fi']);

    // Nicolas modifie la note de Grace.
    const edited = await http()
      .patch(`${h.base}/notes/${wifi.body.id}`)
      .set(h.nicolas.auth)
      .send({ body: 'Code : 5678', pinned: true, version: 1 })
      .expect(200);
    expect(edited.body).toMatchObject({
      body: 'Code : 5678',
      pinned: true,
      version: 2,
      updatedById: h.nicolas.memberId,
    });

    await http().delete(`${h.base}/notes/${wifi.body.id}`).set(h.grace.auth).expect(204);
    await http().delete(`${h.base}/notes/${wifi.body.id}`).set(h.grace.auth).expect(404);
  });

  it('modification simultanée : 409 avec la version actuelle', async () => {
    const h = await coupleHousehold(app);
    const note = await http()
      .post(`${h.base}/notes`)
      .set(h.grace.auth)
      .send({ title: 'Mesures', body: 'Fenêtre : 120 cm' })
      .expect(201);
    await http()
      .patch(`${h.base}/notes/${note.body.id}`)
      .set(h.nicolas.auth)
      .send({ body: 'Fenêtre : 125 cm', version: 1 })
      .expect(200);
    const conflict = await http()
      .patch(`${h.base}/notes/${note.body.id}`)
      .set(h.grace.auth)
      .send({ body: 'Fenêtre : 118 cm', version: 1 })
      .expect(409);
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
    expect(conflict.body.error.details.current).toMatchObject({
      body: 'Fenêtre : 125 cm',
      version: 2,
    });
  });

  it('aucun accès depuis un autre foyer, même avec l’identifiant', async () => {
    const h = await coupleHousehold(app);
    const note = await http()
      .post(`${h.base}/notes`)
      .set(h.grace.auth)
      .send({ title: 'Code alarme', body: '0000' })
      .expect(201);
    const other = await coupleHousehold(app);
    // Un membre d'un autre foyer ne voit rien, ni par la liste, ni par l'identifiant.
    expect(
      (await http().get(`${other.base}/notes`).set(other.grace.auth).expect(200)).body,
    ).toEqual([]);
    await http()
      .patch(`${other.base}/notes/${note.body.id}`)
      .set(other.grace.auth)
      .send({ title: 'Piraté', version: 1 })
      .expect(404);
    await http().delete(`${other.base}/notes/${note.body.id}`).set(other.grace.auth).expect(404);
    const outsider = await registerUser(app, 'Intrus');
    await http().get(`${h.base}/notes`).set(outsider.auth).expect(404);

    const exported = await http().get('/v1/me/export').set(h.grace.auth).expect(200);
    expect(exported.body.notesCreated).toEqual([
      expect.objectContaining({ title: 'Code alarme', body: '0000' }),
    ]);
  });
});
