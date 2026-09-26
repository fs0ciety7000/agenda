import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, CSRF, registerUser } from './app';
import { resetEnvCache } from '../src/config/env';

describe('Inscriptions fermées (REGISTRATION_ENABLED=false)', () => {
  let app: INestApplication;
  let existing: Awaited<ReturnType<typeof registerUser>>;

  beforeAll(async () => {
    app = await createTestApp();
    existing = await registerUser(app, 'Grace');
    process.env.REGISTRATION_ENABLED = 'false';
    resetEnvCache();
  });
  afterAll(async () => {
    delete process.env.REGISTRATION_ENABLED;
    resetEnvCache();
    await app.close();
  });

  it('refuse une nouvelle inscription mais laisse les membres existants se connecter', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .set(CSRF)
      .send({ email: 'intrus@example.test', password: 'correct horse battery', displayName: 'X' })
      .expect(403);
    expect(res.body.error.code).toBe('REGISTRATION_CLOSED');

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set(CSRF)
      .send({ email: existing.email, password: 'correct horse battery' })
      .expect(200);
  });
});
