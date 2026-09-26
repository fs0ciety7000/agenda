import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestApp } from './app';

describe('Health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('live & ready', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });
});
