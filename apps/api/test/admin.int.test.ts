import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import { coupleHousehold, createTestApp, CSRF } from './app';

describe('Administration (intégration)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    delete process.env.ADMIN_EMAILS;
    resetEnvCache();
    await app.close();
    await prisma.$disconnect();
  });

  it('réservée aux adresses ADMIN_EMAILS ; comptes, foyers, désactivation, sauvegarde', async () => {
    const h = await coupleHousehold(app);
    // Pas administrateur : la page n'existe pas.
    await http().get('/v1/admin/overview').set(h.nicolas.auth).expect(404);

    process.env.ADMIN_EMAILS = ` other@example.test , ${h.nicolas.email.toUpperCase()} `;
    resetEnvCache();
    const me = await http().get('/v1/me').set(h.nicolas.auth).expect(200);
    expect(me.body.isAdmin).toBe(true);
    await http().get('/v1/admin/overview').set(h.grace.auth).expect(404);

    const overview = await http().get('/v1/admin/overview').set(h.nicolas.auth).expect(200);
    expect(overview.body.counts.users).toBeGreaterThanOrEqual(2);
    expect(overview.body.storage.databaseBytes).toBeGreaterThan(0);
    expect(overview.body.integrations.map((i: { key: string }) => i.key)).toContain('webPush');

    const users = (await http().get('/v1/admin/users').set(h.nicolas.auth).expect(200)).body as {
      id: string;
      email: string;
      households: string[];
      activeSessions: number;
      isAdmin: boolean;
    }[];
    const grace = users.find((u) => u.email === h.grace.email)!;
    expect(grace).toMatchObject({ households: ['G & N'], activeSessions: 1, isAdmin: false });

    const households = (await http().get('/v1/admin/households').set(h.nicolas.auth).expect(200))
      .body as { id: string; members: { email: string | null }[] }[];
    expect(households.find((x) => x.id === h.householdId)!.members).toHaveLength(2);

    // Désactivée : déconnectée tout de suite, connexion refusée ; réactivée : connexion possible.
    await http().post(`/v1/admin/users/${grace.id}/disable`).set(h.nicolas.auth).expect(204);
    await http().get('/v1/me').set(h.grace.auth).expect(401);
    const login = () =>
      http()
        .post('/v1/auth/login')
        .set(CSRF)
        .set('x-client', 'mobile')
        .send({ email: h.grace.email, password: 'correct horse battery' });
    expect((await login().expect(403)).body.error.code).toBe('ACCOUNT_DISABLED');
    await http().post(`/v1/admin/users/${grace.id}/enable`).set(h.nicolas.auth).expect(204);
    await login().expect(200);

    // Jamais sur son propre compte.
    const self = users.find((u) => u.email === h.nicolas.email)!;
    await http().post(`/v1/admin/users/${self.id}/disable`).set(h.nicolas.auth).expect(403);

    // Compte créé par l'admin (inscriptions fermées ou non) : sans mot de passe, puis supprimé.
    const email = `lea.${randomUUID()}@example.test`;
    const created = await http()
      .post('/v1/admin/users')
      .set(h.nicolas.auth)
      .send({ email, displayName: 'Léa' })
      .expect(201);
    expect(created.body).toMatchObject({ email, hasPassword: false, households: [] });
    await http()
      .post('/v1/admin/users')
      .set(h.nicolas.auth)
      .send({ email, displayName: 'Léa' })
      .expect(409);
    expect(await prisma.passwordResetToken.count({ where: { userId: created.body.id } })).toBe(1);
    await http().delete(`/v1/admin/users/${created.body.id}`).set(h.nicolas.auth).expect(204);
    expect(await prisma.user.count({ where: { email } })).toBe(0);

    // Sauvegarde demandée : une seule en attente à la fois.
    await prisma.backupRun.deleteMany({ where: { status: { in: ['PENDING', 'RUNNING'] } } });
    const b1 = await http().post('/v1/admin/backups').set(h.nicolas.auth).expect(201);
    const b2 = await http().post('/v1/admin/backups').set(h.nicolas.auth).expect(201);
    expect(b1.body).toMatchObject({ status: 'PENDING', trigger: 'manual' });
    expect(b2.body.id).toBe(b1.body.id);
    const list = await http().get('/v1/admin/backups').set(h.nicolas.auth).expect(200);
    expect(list.body[0].id).toBe(b1.body.id);
    await prisma.backupRun.delete({ where: { id: b1.body.id } });

    const mail = await http().post('/v1/admin/test-email').set(h.nicolas.auth).expect(200);
    // SMTP de test (boîte locale) : envoyé à l'adresse de l'admin.
    expect(mail.body).toEqual({ ok: true, detail: h.nicolas.email });
  });
});
