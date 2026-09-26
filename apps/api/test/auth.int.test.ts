import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createTestApp, CSRF, registerUser } from './app';

describe('Auth (intégration)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('refresh concurrents (deux onglets) : le rejeu immédiat est toléré', async () => {
    const grace = await registerUser(app, 'Grace');
    const refresh = () =>
      http()
        .post('/v1/auth/refresh')
        .set(CSRF)
        .set('x-client', 'mobile')
        .send({ refreshToken: grace.refreshToken });
    const [a, b] = await Promise.all([refresh(), refresh()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    await http()
      .get('/v1/me')
      .set({ authorization: `Bearer ${a.body.accessToken}` })
      .expect(200);
    await http()
      .get('/v1/me')
      .set({ authorization: `Bearer ${b.body.accessToken}` })
      .expect(200);
  });

  it('inscription → /me', async () => {
    const grace = await registerUser(app, 'Grace');
    const me = await http().get('/v1/me').set(grace.auth).expect(200);
    expect(me.body).toMatchObject({ id: grace.userId, displayName: 'Grace', locale: 'fr' });
  });

  it('refuse un email déjà utilisé', async () => {
    const grace = await registerUser(app, 'Grace');
    const res = await http()
      .post('/v1/auth/register')
      .set(CSRF)
      .send({ email: grace.email.toUpperCase(), password: 'another password', displayName: 'X' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_USED');
  });

  it('connexion : mauvais mot de passe et email inconnu donnent la même erreur', async () => {
    const grace = await registerUser(app, 'Grace');
    const wrong = await http()
      .post('/v1/auth/login')
      .set(CSRF)
      .send({ email: grace.email, password: 'nope' })
      .expect(401);
    const unknown = await http()
      .post('/v1/auth/login')
      .set(CSRF)
      .send({ email: 'nobody@example.test', password: 'nope' })
      .expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body).toEqual(wrong.body);
  });

  it('web : cookies httpOnly, sans jetons dans le corps', async () => {
    const grace = await registerUser(app, 'Grace');
    const res = await http()
      .post('/v1/auth/login')
      .set(CSRF)
      .send({ email: grace.email, password: 'correct horse battery' })
      .expect(200);
    expect(res.body.accessToken).toBeUndefined();
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(
      cookies.some(
        (c) => c.startsWith('gn_at=') && c.includes('HttpOnly') && c.includes('SameSite=Lax'),
      ),
    ).toBe(true);
    expect(cookies.some((c) => c.startsWith('gn_rt=') && c.includes('Path=/v1/auth'))).toBe(true);

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/v1/auth/login')
      .set(CSRF)
      .send({ email: grace.email, password: 'correct horse battery' });
    await agent.get('/v1/me').expect(200);
  });

  it('CSRF : une mutation sans header personnalisé est refusée', async () => {
    const res = await http()
      .post('/v1/auth/login')
      .send({ email: 'a@b.be', password: 'x' })
      .expect(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('refresh : rotation, puis rejeu d’un ancien token ⇒ famille révoquée', async () => {
    const grace = await registerUser(app, 'Grace');
    const first = await http()
      .post('/v1/auth/refresh')
      .set(CSRF)
      .set('x-client', 'mobile')
      .send({ refreshToken: grace.refreshToken })
      .expect(200);
    expect(first.body.refreshToken).not.toBe(grace.refreshToken);

    // Rejeu de l'ancien token (vol simulé), hors de la fenêtre de grâce de 30 s.
    await prisma.session.updateMany({
      where: { userId: grace.userId, replacedAt: { not: null } },
      data: { replacedAt: new Date(Date.now() - 60_000) },
    });
    const replay = await http()
      .post('/v1/auth/refresh')
      .set(CSRF)
      .set('x-client', 'mobile')
      .send({ refreshToken: grace.refreshToken })
      .expect(401);
    expect(replay.body.error.code).toBe('SESSION_EXPIRED');

    // Le token légitime le plus récent est lui aussi révoqué, et l'access token ne marche plus.
    await http()
      .post('/v1/auth/refresh')
      .set(CSRF)
      .send({ refreshToken: first.body.refreshToken })
      .expect(401);
    await http()
      .get('/v1/me')
      .set({ authorization: `Bearer ${first.body.accessToken}` })
      .expect(401);
  });

  it('logout-all révoque toutes les sessions immédiatement', async () => {
    const grace = await registerUser(app, 'Grace');
    const phone = await http()
      .post('/v1/auth/login')
      .set(CSRF)
      .set('x-client', 'mobile')
      .send({ email: grace.email, password: 'correct horse battery' })
      .expect(200);
    await http().post('/v1/auth/logout-all').set(grace.auth).expect(204);

    await http().get('/v1/me').set(grace.auth).expect(401);
    await http()
      .get('/v1/me')
      .set({ authorization: `Bearer ${phone.body.accessToken}` })
      .expect(401);
    await http()
      .post('/v1/auth/refresh')
      .set(CSRF)
      .send({ refreshToken: phone.body.refreshToken })
      .expect(401);
  });

  it('refuse un access token falsifié', async () => {
    await http()
      .get('/v1/me')
      .set({ authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' })
      .expect(401);
  });
});
