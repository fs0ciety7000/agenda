import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import { createTestApp, CSRF } from './app';

describe('Inscriptions par heure et par IP', () => {
  let app: INestApplication;
  const previous = process.env.REGISTER_HOURLY_LIMIT;

  beforeAll(async () => {
    process.env.REGISTER_HOURLY_LIMIT = '2';
    resetEnvCache();
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    process.env.REGISTER_HOURLY_LIMIT = previous;
    resetEnvCache();
  });

  it('au-delà de REGISTER_HOURLY_LIMIT comptes depuis la même IP : 429, la connexion reste possible', async () => {
    const register = (n: number) =>
      request(app.getHttpServer())
        .post('/v1/auth/register')
        .set(CSRF)
        .send({
          email: `limite.${Date.now()}.${n}@example.test`,
          password: 'correct horse battery',
          displayName: `Emma ${n}`,
        });
    await register(1).expect(201);
    await register(2).expect(201);
    const refused = await register(3).expect(429);
    expect(refused.body.error.code).toBe('RATE_LIMITED');
    // Seule l'inscription est freinée : se connecter n'est pas compté dans cette fenêtre.
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set(CSRF)
      .send({ email: 'inconnu@example.test', password: 'correct horse battery' })
      .expect(401);
  });
});
