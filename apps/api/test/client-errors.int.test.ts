import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, CSRF } from './app';

describe('Remontée des erreurs du site et de l’app', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('accepte une erreur (même sans être connecté), refuse le reste', async () => {
    await http()
      .post('/v1/client-errors')
      .set(CSRF)
      .send({ source: 'web', message: 'TypeError: x is undefined', location: '/tasks' })
      .expect(204);
    await http()
      .post('/v1/client-errors')
      .set(CSRF)
      .send({
        source: 'android',
        message: 'NullPointerException',
        stack: 'at …',
        release: '0.3.12',
      })
      .expect(204);
    const bad = await http()
      .post('/v1/client-errors')
      .set(CSRF)
      .send({ source: 'ios', message: '' })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    await http().post('/v1/client-errors').send({ source: 'web', message: 'x' }).expect(403); // CSRF
  });
});
