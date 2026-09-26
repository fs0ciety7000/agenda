import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Idempotency-Key (rejeu Android hors ligne)', () => {
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

  const taskCount = (householdId: string) =>
    prisma.task.count({ where: { householdId, deletedAt: null } });

  it('rejouer une création renvoie la même tâche sans doublon', async () => {
    const h = await coupleHousehold(app);
    const key = randomUUID();
    const first = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .set('Idempotency-Key', key)
      .send({ title: 'Acheter du pain' })
      .expect(201);
    const replay = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .set('Idempotency-Key', key)
      .send({ title: 'Acheter du pain' })
      .expect(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.id).toBe(first.body.id);
    expect(await taskCount(h.householdId)).toBe(1);
  });

  it('quick add : rejeu sans doublon', async () => {
    const h = await coupleHousehold(app);
    const key = randomUUID();
    for (let i = 0; i < 3; i++) {
      await http()
        .post(`${h.base}/tasks/quick`)
        .set(h.nicolas.auth)
        .set('Idempotency-Key', key)
        .send({ text: 'Sortir les poubelles demain 20h' })
        .expect(201);
    }
    expect(await taskCount(h.householdId)).toBe(1);
  });

  it('rejeux simultanés : une seule tâche créée', async () => {
    const h = await coupleHousehold(app);
    const key = randomUUID();
    const send = () =>
      http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .set('Idempotency-Key', key)
        .send({ title: 'Arroser les plantes' });
    const results = await Promise.all([send(), send(), send()]);
    for (const r of results) expect([201, 409]).toContain(r.status);
    expect(results.some((r) => r.status === 201)).toBe(true);
    expect(await taskCount(h.householdId)).toBe(1);
  });

  it('clé réutilisée par un autre utilisateur ou sur une autre route : 422', async () => {
    const h = await coupleHousehold(app);
    const key = randomUUID();
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .set('Idempotency-Key', key)
      .send({ title: 'Lessive' })
      .expect(201);
    const other = await http()
      .post(`${h.base}/tasks`)
      .set(h.nicolas.auth)
      .set('Idempotency-Key', key)
      .send({ title: 'Lessive' })
      .expect(422);
    expect(other.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    await http()
      .post(`${h.base}/tasks/quick`)
      .set(h.grace.auth)
      .set('Idempotency-Key', key)
      .send({ text: 'Lessive' })
      .expect(422);
    expect(await taskCount(h.householdId)).toBe(1);
  });

  it('une requête en échec libère la clé ; clé mal formée refusée', async () => {
    const h = await coupleHousehold(app);
    const key = randomUUID();
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .set('Idempotency-Key', key)
      .send({ title: '' })
      .expect(400);
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .set('Idempotency-Key', key)
      .send({ title: 'Corrigé' })
      .expect(201);
    const bad = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .set('Idempotency-Key', 'x')
      .send({ title: 'Nope' })
      .expect(400);
    expect(bad.body.error.code).toBe('IDEMPOTENCY_KEY_INVALID');
    expect(await taskCount(h.householdId)).toBe(1);
  });

  it('sans en-tête : comportement inchangé (deux créations)', async () => {
    const h = await coupleHousehold(app);
    for (let i = 0; i < 2; i++) {
      await http().post(`${h.base}/tasks`).set(h.grace.auth).send({ title: 'Courses' }).expect(201);
    }
    expect(await taskCount(h.householdId)).toBe(2);
  });
});
