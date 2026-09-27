import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { loadTestEnv } from './env';

loadTestEnv();

export const CSRF = { 'x-requested-with': 'agenda-gn' } as const;

export async function createTestApp(
  overrides: { provide: unknown; useValue: unknown }[] = [],
): Promise<INestApplication> {
  // Import après loadTestEnv() : env() est lu à l'initialisation des modules.
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/bootstrap');
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const o of overrides) builder = builder.overrideProvider(o.provide).useValue(o.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false, rawBody: true });
  configureApp(app);
  await app.init();
  return app;
}

/** Crée un utilisateur (client mobile) et renvoie ses jetons. */
export async function registerUser(app: INestApplication, name: string) {
  // UUID : unique même entre fichiers de test exécutés en parallèle (compteur propre à chaque fichier).
  const email = `${name.toLowerCase()}.${randomUUID()}@example.test`;
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

/** Foyer « G & N » : Nicolas (propriétaire) + Grace (invitée). */
export async function coupleHousehold(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const nicolas = await registerUser(app, 'Nicolas');
  const grace = await registerUser(app, 'Grace');
  const created = await http()
    .post('/v1/households')
    .set(nicolas.auth)
    .send({ name: 'G & N' })
    .expect(201);
  const householdId = created.body.id as string;
  const invite = await http()
    .post(`/v1/households/${householdId}/invitations`)
    .set(nicolas.auth)
    .send({})
    .expect(201);
  const joined = await http()
    .post('/v1/invitations/accept')
    .set(grace.auth)
    .send({ token: invite.body.token })
    .expect(201);
  const members = joined.body.members as { id: string; displayName: string }[];
  return {
    householdId,
    base: `/v1/households/${householdId}`,
    nicolas: { ...nicolas, memberId: members.find((m) => m.displayName === 'Nicolas')!.id },
    grace: { ...grace, memberId: members.find((m) => m.displayName === 'Grace')!.id },
  };
}
