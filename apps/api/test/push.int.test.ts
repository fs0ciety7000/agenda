import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

interface Recorded {
  path: string;
  body: string;
  auth?: string;
}

/** Faux Google : échange du JWT contre un jeton, puis réception des messages FCM. */
describe('Notifications instantanées (FCM, intégration)', () => {
  let app: INestApplication;
  let fake: Server;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const received: Recorded[] = [];
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data));
    });

  beforeAll(async () => {
    fake = createServer(async (req, res) => {
      const body = await readBody(req);
      received.push({ path: req.url!, body, auth: req.headers.authorization });
      if (req.url === '/token') {
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ access_token: 'access-123', expires_in: 3600 }));
      }
      if (body.includes('dead-token')) {
        res.statusCode = 404;
        return res.end('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}');
      }
      res.end('{"name":"projects/p/messages/1"}');
    });
    await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
    process.env.FCM_API_URL = base;
    process.env.FCM_SERVICE_ACCOUNT = Buffer.from(
      JSON.stringify({
        project_id: 'agenda-test',
        client_email: 'push@agenda-test.iam.gserviceaccount.com',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        token_uri: `${base}/token`,
      }),
    ).toString('base64');
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    fake.close();
  });

  const messages = () => received.filter((r) => r.path.endsWith('messages:send'));
  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 50 && !predicate(); i++) await new Promise((r) => setTimeout(r, 50));
    expect(predicate()).toBe(true);
  };

  it('tâche confiée : téléphones de la personne réveillés sans contenu ; jeton périmé oublié', async () => {
    const h = await coupleHousehold(app);
    for (const token of ['grace-phone-token-1', 'dead-token-abcdef']) {
      await http().put('/v1/me/push-tokens').set(h.grace.auth).send({ token }).expect(204);
    }
    await http()
      .put('/v1/me/push-tokens')
      .set(h.nicolas.auth)
      .send({ token: 'nicolas-phone-token' })
      .expect(204);

    await http()
      .post(`${h.base}/tasks`)
      .set(h.nicolas.auth)
      .send({ title: 'Titre secret', assigneeIds: [h.grace.memberId] })
      .expect(201);

    await waitFor(() => messages().length === 2);
    const bodies = messages().map((m) => JSON.parse(m.body).message);
    expect(bodies.map((b) => b.token).sort()).toEqual(['dead-token-abcdef', 'grace-phone-token-1']);
    for (const m of messages()) {
      expect(m.auth).toBe('Bearer access-123');
      expect(m.path).toBe('/v1/projects/agenda-test/messages:send');
      // Aucune donnée personnelle ne transite par Google.
      expect(m.body).not.toContain('Titre secret');
      expect(JSON.parse(m.body).message.data).toEqual({
        kind: 'activity',
        householdId: h.householdId,
      });
    }
    // JWT du compte de service signé avec la bonne clé.
    const assertion = new URLSearchParams(received.find((r) => r.path === '/token')!.body).get(
      'assertion',
    )!;
    const [header, claims, signature] = assertion.split('.');
    expect(
      createVerify('RSA-SHA256')
        .update(`${header}.${claims}`)
        .verify(publicKey, Buffer.from(signature!, 'base64url')),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toMatchObject({
      iss: 'push@agenda-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    });

    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.pushToken.count({ where: { token: 'dead-token-abcdef' } })).toBe(0);
    expect(await prisma.pushToken.count({ where: { token: 'grace-phone-token-1' } })).toBe(1);
  });

  it('préférence « sur le téléphone » désactivée ou déconnexion : aucun réveil', async () => {
    const h = await coupleHousehold(app);
    await http()
      .put('/v1/me/push-tokens')
      .set(h.grace.auth)
      .send({ token: 'grace-quiet-token' })
      .expect(204);
    await http()
      .put(`${h.base}/notification-preferences`)
      .set(h.grace.auth)
      .send({ preferences: [{ type: 'TASK_ASSIGNED', inApp: true, push: false }] })
      .expect(200);
    const before = messages().length;
    await http()
      .post(`${h.base}/tasks`)
      .set(h.nicolas.auth)
      .send({ title: 'Linge', assigneeIds: [h.grace.memberId] })
      .expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(messages().length).toBe(before);

    const status = await http().get('/v1/me/push-tokens/status').set(h.grace.auth).expect(200);
    expect(status.body).toMatchObject({ serverEnabled: true, serverIssue: null, devices: 1 });
    await http().delete('/v1/me/push-tokens/grace-quiet-token').set(h.grace.auth).expect(204);
    const after = await http().get('/v1/me/push-tokens/status').set(h.grace.auth).expect(200);
    expect(after.body).toMatchObject({ devices: 0, lastRegisteredAt: null });
    expect(await prisma.pushToken.count({ where: { token: 'grace-quiet-token' } })).toBe(0);
  });
});
