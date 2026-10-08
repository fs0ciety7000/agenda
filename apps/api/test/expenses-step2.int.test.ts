import { INestApplication } from '@nestjs/common';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

/** « 2026-10 » + n mois. */
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

describe('Dépenses : parts à la main, charges fixes, tickets', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');
  const month = today.slice(0, 7);

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('parts saisies à la main : somme exacte exigée, comptées comme communes', async () => {
    const h = await coupleHousehold(app);
    const g = h.grace.memberId;
    const n = h.nicolas.memberId;
    const body = {
      paidById: g,
      amountCents: 9000,
      date: today,
      title: 'Restaurant',
      split: 'CUSTOM',
      shares: [
        { memberId: g, amountCents: 3000 },
        { memberId: n, amountCents: 6000 },
      ],
    };
    await http()
      .post(`${h.base}/expenses`)
      .set(h.grace.auth)
      .send({ ...body, shares: [{ memberId: g, amountCents: 1 }] })
      .expect(400);
    const created = await http()
      .post(`${h.base}/expenses`)
      .set(h.grace.auth)
      .send(body)
      .expect(201);
    expect(created.body.split).toBe('CUSTOM');

    const summary = await http()
      .get(`${h.base}/expenses/summary?month=${month}`)
      .set(h.grace.auth)
      .expect(200);
    expect(summary.body.commonCents).toBe(9000);
    const bal = (id: string) =>
      summary.body.members.find((m: { memberId: string }) => m.memberId === id).balanceCents;
    expect(bal(n)).toBe(-6000);

    // Montant changé sans nouvelles parts : refusé ; avec : accepté.
    await http()
      .patch(`${h.base}/expenses/${created.body.id}`)
      .set(h.grace.auth)
      .send({ amountCents: 10000 })
      .expect(400);
    const edited = await http()
      .patch(`${h.base}/expenses/${created.body.id}`)
      .set(h.grace.auth)
      .send({
        amountCents: 10000,
        shares: [
          { memberId: g, amountCents: 5000 },
          { memberId: n, amountCents: 5000 },
        ],
      })
      .expect(200);
    expect(edited.body.shares.map((s: { amountCents: number }) => s.amountCents)).toEqual([
      5000, 5000,
    ]);
  });

  it('charge fixe : échéances passées créées une seule fois, arrêt', async () => {
    const h = await coupleHousehold(app);
    const start = `${addMonths(month, -2)}-01`;
    const rule = await http()
      .post(`${h.base}/expenses/recurring`)
      .set(h.nicolas.auth)
      .send({
        paidById: h.nicolas.memberId,
        amountCents: 95000,
        title: 'Loyer',
        category: 'HOUSING',
        startDate: start,
      })
      .expect(201);
    expect(rule.body.dayOfMonth).toBe(1);

    for (const m of [addMonths(month, -2), addMonths(month, -1), month]) {
      // Deux lectures : toujours une seule échéance par mois.
      await http().get(`${h.base}/expenses/summary?month=${m}`).set(h.grace.auth).expect(200);
      const list = await http().get(`${h.base}/expenses?month=${m}`).set(h.grace.auth).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({
        title: 'Loyer',
        date: `${m}-01`,
        recurringId: rule.body.id,
      });
    }
    const rules = await http().get(`${h.base}/expenses/recurring`).set(h.grace.auth).expect(200);
    expect(rules.body).toHaveLength(1);

    await http()
      .delete(`${h.base}/expenses/recurring/${rule.body.id}`)
      .set(h.grace.auth)
      .expect(204);
    expect(
      (await http().get(`${h.base}/expenses/recurring`).set(h.grace.auth).expect(200)).body,
    ).toEqual([]);
    // Les dépenses déjà créées restent.
    const list = await http()
      .get(`${h.base}/expenses?month=${month}`)
      .set(h.grace.auth)
      .expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('ticket : image ou PDF, visible comme la dépense, remplacé puis retiré', async () => {
    const h = await coupleHousehold(app);
    const expense = await http()
      .post(`${h.base}/expenses`)
      .set(h.grace.auth)
      .send({ paidById: h.grace.memberId, amountCents: 4210, date: today, title: 'Pharmacie' })
      .expect(201);
    expect(expense.body.hasReceipt).toBe(false);
    const url = `${h.base}/expenses/${expense.body.id}/receipt`;
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

    await http()
      .post(url)
      .set(h.grace.auth)
      .attach('file', Buffer.from('MZ'), {
        filename: 'virus.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400);
    const withReceipt = await http()
      .post(url)
      .set(h.grace.auth)
      .attach('file', png, { filename: 'ticket.png', contentType: 'image/png' })
      .expect(201);
    expect(withReceipt.body.hasReceipt).toBe(true);

    const got = await http().get(url).set(h.nicolas.auth).expect(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['content-security-policy']).toContain('sandbox');

    const other = await coupleHousehold(app);
    await http().get(url).set(other.grace.auth).expect(404);

    await http().delete(url).set(h.grace.auth).expect(204);
    await http().get(url).set(h.grace.auth).expect(404);
  });
});
