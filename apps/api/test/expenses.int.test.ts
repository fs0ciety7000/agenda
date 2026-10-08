import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Dépenses du foyer', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');
  const month = today.slice(0, 7);

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('commune, avancée, personnelle : parts, solde, remboursement', async () => {
    const h = await coupleHousehold(app);
    const g = h.grace.memberId;
    const n = h.nicolas.memberId;

    // Grace paie 85,01 € de courses communes : 42,51 / 42,50.
    const courses = await http()
      .post(`${h.base}/expenses`)
      .set(h.grace.auth)
      .send({
        paidById: g,
        amountCents: 8501,
        date: today,
        title: 'Courses',
        category: 'GROCERIES',
      })
      .expect(201);
    expect(
      courses.body.shares.reduce((a: number, s: { amountCents: number }) => a + s.amountCents, 0),
    ).toBe(8501);

    // Nicolas avance 20 € pour Grace.
    await http()
      .post(`${h.base}/expenses`)
      .set(h.nicolas.auth)
      .send({
        paidById: n,
        amountCents: 2000,
        date: today,
        title: 'Cinéma',
        split: 'FOR_OTHER',
        forMemberId: g,
      })
      .expect(201);

    // Dépense personnelle de Nicolas : invisible pour Grace, sans effet sur le solde.
    const perso = await http()
      .post(`${h.base}/expenses`)
      .set(h.nicolas.auth)
      .send({ paidById: n, amountCents: 1500, date: today, title: 'Livre', split: 'PERSONAL' })
      .expect(201);

    const forGrace = await http()
      .get(`${h.base}/expenses?month=${month}`)
      .set(h.grace.auth)
      .expect(200);
    expect(forGrace.body.map((e: { title: string }) => e.title).sort()).toEqual([
      'Cinéma',
      'Courses',
    ]);
    await http().delete(`${h.base}/expenses/${perso.body.id}`).set(h.grace.auth).expect(404);

    const summary = await http()
      .get(`${h.base}/expenses/summary?month=${month}`)
      .set(h.nicolas.auth)
      .expect(200);
    const bal = (id: string) =>
      summary.body.members.find((m: { memberId: string }) => m.memberId === id).balanceCents;
    // Grace : payé 85,01, sa part 42,51 + 20,00 → +22,50 ; Nicolas : −22,50.
    const graceShare = courses.body.shares.find(
      (s: { memberId: string }) => s.memberId === g,
    ).amountCents;
    expect(bal(g)).toBe(8501 - graceShare - 2000);
    expect(bal(n)).toBe(-bal(g));
    expect(summary.body.commonCents).toBe(8501);
    expect(summary.body.mineCents).toBe(1500);
    expect(summary.body.transfers).toEqual([
      { fromMemberId: n, toMemberId: g, amountCents: bal(g) },
    ]);

    // Remboursement : soldes à zéro.
    await http()
      .post(`${h.base}/expenses/settle`)
      .set(h.nicolas.auth)
      .send({ fromMemberId: n, toMemberId: g, amountCents: bal(g) })
      .expect(201);
    const after = await http()
      .get(`${h.base}/expenses/summary?month=${month}`)
      .set(h.grace.auth)
      .expect(200);
    expect(after.body.members.every((m: { balanceCents: number }) => m.balanceCents === 0)).toBe(
      true,
    );
    expect(after.body.transfers).toEqual([]);
  });

  it('proportions 60/40, modification, renvoi sans doublon, droits', async () => {
    const h = await coupleHousehold(app);
    const g = h.grace.memberId;
    const n = h.nicolas.memberId;
    await http()
      .put(`${h.base}/expenses/weights`)
      .set(h.grace.auth)
      .send({
        weights: [
          { memberId: g, weight: 60 },
          { memberId: n, weight: 40 },
        ],
      })
      .expect(204);

    const id = randomUUID();
    const body = {
      id,
      paidById: n,
      amountCents: 100000,
      date: today,
      title: 'Loyer',
      category: 'HOUSING',
    };
    const first = await http()
      .post(`${h.base}/expenses`)
      .set(h.nicolas.auth)
      .send(body)
      .expect(201);
    const again = await http()
      .post(`${h.base}/expenses`)
      .set(h.nicolas.auth)
      .send(body)
      .expect(201);
    expect(again.body.id).toBe(first.body.id);
    const share = (e: { shares: { memberId: string; amountCents: number }[] }, m: string) =>
      e.shares.find((s) => s.memberId === m)?.amountCents;
    expect(share(first.body, g)).toBe(60000);
    expect(share(first.body, n)).toBe(40000);

    const edited = await http()
      .patch(`${h.base}/expenses/${id}`)
      .set(h.grace.auth)
      .send({ amountCents: 120000, note: 'Avec les charges' })
      .expect(200);
    expect(share(edited.body, g)).toBe(72000);
    expect(edited.body.note).toBe('Avec les charges');

    // Un autre foyer ne voit rien, et ne peut pas réutiliser l'identifiant.
    const other = await coupleHousehold(app);
    await http().get(`${h.base}/expenses?month=${month}`).set(other.grace.auth).expect(404);
    await http()
      .post(`${other.base}/expenses`)
      .set(other.grace.auth)
      .send({ ...body, paidById: other.grace.memberId })
      .expect(404);
    // Payeur hors du foyer refusé.
    await http()
      .post(`${h.base}/expenses`)
      .set(h.grace.auth)
      .send({ paidById: other.grace.memberId, amountCents: 100, date: today, title: 'x' })
      .expect(400);
    // Avancée sans bénéficiaire refusée.
    await http()
      .post(`${h.base}/expenses`)
      .set(h.grace.auth)
      .send({ paidById: g, amountCents: 100, date: today, title: 'x', split: 'FOR_OTHER' })
      .expect(400);

    await http().delete(`${h.base}/expenses/${id}`).set(h.grace.auth).expect(204);
    const list = await http()
      .get(`${h.base}/expenses?month=${month}`)
      .set(h.grace.auth)
      .expect(200);
    expect(list.body).toEqual([]);
  });
});
