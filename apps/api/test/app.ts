import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { loadTestEnv } from './env';

loadTestEnv();

export const CSRF = { 'x-requested-with': 'agenda-gn' } as const;

export async function createTestApp(): Promise<INestApplication> {
  // Import après loadTestEnv() : env() est lu à l'initialisation des modules.
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/bootstrap');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

let counter = 0;

/** Crée un utilisateur (client mobile) et renvoie ses jetons. */
export async function registerUser(app: INestApplication, name: string) {
  const email = `${name.toLowerCase()}.${Date.now()}.${counter++}@example.test`;
  const res = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .set(CSRF)
    .set('x-client', 'mobile')
    .send({ email, password: 'correct horse battery', displayName: name })
    .expect(201);
  return {
    email,
    userId: res.body.user.id as string,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
    auth: { authorization: `Bearer ${res.body.accessToken}`, ...CSRF },
  };
}
