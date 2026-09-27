import { get, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp, registerUser } from './app';

/** Ouvre le flux temps réel et renvoie les sujets reçus au fil de l'eau. */
async function openStream(port: number, path: string, auth: Record<string, string>) {
  const topics: string[] = [];
  const res = await new Promise<IncomingMessage>((resolve, reject) =>
    get({ host: '127.0.0.1', port, path, headers: auth }, resolve).on('error', reject),
  );
  let buffer = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block.split('\n').find((l) => l.startsWith('data: '));
      if (block.includes('event: change') && data) topics.push(JSON.parse(data.slice(6)).topic);
    }
  });
  return { res, topics, close: () => res.destroy() };
}

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(check()).toBe(true);
};

describe('Liste de courses et temps réel (intégration)', () => {
  let app: INestApplication;
  let port: number;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(() => app.close());

  it('ajout idempotent, coche par l’autre, vider le panier ; l’autre téléphone est prévenu', async () => {
    const h = await coupleHousehold(app);
    const stream = await openStream(port, `${h.base}/events`, h.grace.auth);
    expect(stream.res.statusCode).toBe(200);
    expect(stream.res.headers['content-type']).toContain('text/event-stream');

    const id = randomUUID();
    const milk = await http()
      .post(`${h.base}/shopping`)
      .set(h.nicolas.auth)
      .send({ id, text: '  Lait ' })
      .expect(201);
    expect(milk.body).toMatchObject({
      id,
      text: 'Lait',
      done: false,
      createdById: h.nicolas.memberId,
    });
    // Rejoué (réseau coupé avant la réponse) : même article, pas de doublon.
    await http()
      .post(`${h.base}/shopping`)
      .set(h.nicolas.auth)
      .send({ id, text: 'Lait' })
      .expect(201);
    await http().post(`${h.base}/shopping`).set(h.nicolas.auth).send({ text: 'Pain' }).expect(201);
    await waitFor(() => stream.topics.filter((t) => t === 'shopping').length >= 2);

    await http()
      .patch(`${h.base}/shopping/${id}`)
      .set(h.grace.auth)
      .send({ done: true })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ done: true, doneById: h.grace.memberId }));
    const list = await http().get(`${h.base}/shopping`).set(h.nicolas.auth).expect(200);
    expect(list.body.map((i: { text: string }) => i.text)).toEqual(['Pain', 'Lait']); // à acheter d'abord

    await http().post(`${h.base}/shopping/clear-done`).set(h.grace.auth).expect(204);
    const after = await http().get(`${h.base}/shopping`).set(h.grace.auth).expect(200);
    expect(after.body.map((i: { text: string }) => i.text)).toEqual(['Pain']);
    // Suppression idempotente (déjà retiré par l'autre).
    await http().delete(`${h.base}/shopping/${id}`).set(h.nicolas.auth).expect(204);
    stream.close();
  });

  it('tâches et notifications sont aussi signalées ; un autre foyer ne voit rien', async () => {
    const h = await coupleHousehold(app);
    const other = await coupleHousehold(app);
    const mine = await openStream(port, `${h.base}/events`, h.grace.auth);
    const theirs = await openStream(port, `${other.base}/events`, other.grace.auth);
    await http()
      .post(`${h.base}/tasks`)
      .set(h.nicolas.auth)
      .send({ title: 'Poubelles', assigneeIds: [h.grace.memberId] })
      .expect(201);
    await waitFor(() => mine.topics.includes('tasks') && mine.topics.includes('notifications'));
    await new Promise((r) => setTimeout(r, 100));
    expect(theirs.topics).toEqual([]);
    mine.close();
    theirs.close();
  });

  it('isolation : ni lecture, ni flux, ni modification depuis un autre foyer', async () => {
    const h = await coupleHousehold(app);
    const stranger = await registerUser(app, 'Intrus');
    const item = await http().post(`${h.base}/shopping`).set(h.nicolas.auth).send({ text: 'Œufs' });
    await http().get(`${h.base}/shopping`).set(stranger.auth).expect(404);
    const stream = await openStream(port, `${h.base}/events`, stranger.auth);
    expect(stream.res.statusCode).toBe(404);
    stream.close();
    const other = await coupleHousehold(app);
    await http()
      .patch(`${other.base}/shopping/${item.body.id}`)
      .set(other.nicolas.auth)
      .send({ done: true })
      .expect(404);
    // Même identifiant proposé depuis un autre foyer : refusé, l'article d'origine est intact.
    await http()
      .post(`${other.base}/shopping`)
      .set(other.nicolas.auth)
      .send({ id: item.body.id, text: 'Piratage' })
      .expect(404);
    await http().post(`${h.base}/shopping`).set(h.nicolas.auth).send({ text: '' }).expect(400);
  });

  it('quantités, rayons devinés puis appris, suggestions « souvent achetés »', async () => {
    const h = await coupleHousehold(app);
    const add = async (body: object) =>
      (await http().post(`${h.base}/shopping`).set(h.grace.auth).send(body).expect(201)).body as {
        id: string;
        text: string;
        quantity: string | null;
        aisle: string;
      };
    expect(await add({ text: '2 kg de pommes' })).toMatchObject({
      text: 'pommes',
      quantity: '2 kg',
      aisle: 'PRODUCE',
    });
    expect(await add({ text: 'lait x6' })).toMatchObject({
      text: 'lait',
      quantity: 'x6',
      aisle: 'DAIRY',
    });
    // Quantité explicite (champ séparé) : le texte n'est pas redécoupé.
    expect(await add({ text: '7 up', quantity: '2' })).toMatchObject({
      text: '7 up',
      quantity: '2',
    });

    // Rayon inconnu corrigé une fois : retenu pour la prochaine fois.
    const odd = await add({ text: 'Speculoos' });
    expect(odd.aisle).toBe('OTHER');
    await http()
      .patch(`${h.base}/shopping/${odd.id}`)
      .set(h.grace.auth)
      .send({ aisle: 'PANTRY', done: true })
      .expect(200);
    expect((await add({ text: 'speculoos' })).aisle).toBe('PANTRY');

    // Suggestions : achetés (cochés) et absents de la liste à acheter.
    const lait = (await http().get(`${h.base}/shopping`).set(h.grace.auth).expect(200)).body.find(
      (i: { text: string }) => i.text === 'lait',
    );
    await http()
      .patch(`${h.base}/shopping/${lait.id}`)
      .set(h.grace.auth)
      .send({ done: true })
      .expect(200);
    const sugg = (await http().get(`${h.base}/shopping/suggestions`).set(h.grace.auth).expect(200))
      .body as { text: string; aisle: string; timesBought: number }[];
    // « speculoos » est de nouveau sur la liste : pas proposé ; « lait » coché : proposé.
    expect(sugg).toEqual([{ text: 'lait', aisle: 'DAIRY', timesBought: 1 }]);
  });
});
