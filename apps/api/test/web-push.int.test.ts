import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import { coupleHousehold, createTestApp, CSRF } from './app';

describe('Notifications du site (Web Push)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const send = vi.spyOn(webpush, 'sendNotification');

  beforeAll(async () => {
    // Clés générées pour le test : jamais de secret dans le dépôt.
    const keys = webpush.generateVAPIDKeys();
    process.env.WEB_PUSH_PUBLIC_KEY = keys.publicKey;
    process.env.WEB_PUSH_PRIVATE_KEY = keys.privateKey;
    resetEnvCache();
    app = await createTestApp();
  });
  afterAll(async () => {
    delete process.env.WEB_PUSH_PUBLIC_KEY;
    delete process.env.WEB_PUSH_PRIVATE_KEY;
    resetEnvCache();
    await app.close();
    await prisma.$disconnect();
  });

  it('abonnement, message chiffré à l’autre, abonnement expiré supprimé', async () => {
    const h = await coupleHousehold(app);
    const key = await http().get('/v1/me/web-push/key').set(h.grace.auth).expect(200);
    expect(key.body.publicKey).toBe(process.env.WEB_PUSH_PUBLIC_KEY);

    const endpoint = `https://push.example.test/${h.grace.memberId}`;
    await http()
      .put('/v1/me/web-push')
      .set(h.grace.auth)
      .set(CSRF)
      .send({ endpoint, keys: { p256dh: 'p256', auth: 'auth' } })
      .expect(204);
    await http()
      .put('/v1/me/web-push')
      .set(h.grace.auth)
      .set(CSRF)
      .send({ endpoint: 'http://insecure.example.test/x', keys: { p256dh: 'p', auth: 'a' } })
      .expect(400);

    send.mockReset();
    send.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    const occ = (
      await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({
          title: 'Vidange',
          date: todayIn('Europe/Brussels'),
          assigneeIds: [h.grace.memberId],
        })
        .expect(201)
    ).body as { id: string };
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const [sub, payload] = send.mock.calls[0]!;
    expect(sub.endpoint).toBe(endpoint);
    expect(JSON.parse(payload as string)).toEqual({
      title: 'Tandem',
      body: 'Nicolas vous a confié « Vidange »',
      url: `/?open=${occ.id}`,
      tag: `occurrence-${occ.id}`,
    });

    // Navigateur désinscrit côté service de push (410) : abonnement supprimé.
    send.mockReset();
    send.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    await http()
      .post(`${h.base}/occurrences/${occ.id}/comments`)
      .set(h.nicolas.auth)
      .send({ body: 'Huile au garage' })
      .expect(201);
    await vi.waitFor(async () =>
      expect(await prisma.webPushSubscription.count({ where: { endpoint } })).toBe(0),
    );

    await http()
      .post('/v1/me/web-push/unsubscribe')
      .set(h.grace.auth)
      .set(CSRF)
      .send({ endpoint })
      .expect(204);
  });
});
