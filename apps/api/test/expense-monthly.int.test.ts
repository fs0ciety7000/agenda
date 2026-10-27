import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExpensesService } from '../src/expenses/expenses.service';
import { monthlyPushText } from '../src/notifications/notifications.service';
import { coupleHousehold, createTestApp } from './app';

type Notif = {
  type: string;
  month: string | null;
  amountCents: number | null;
  budgetCents: number | null;
  count: number | null;
  paid: { name: string; amountCents: number }[] | null;
};

describe('Bilan du mois des dépenses', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('le 1er à 8 h : dépenses communes, budget, ce que chacun a payé ; une seule fois', async () => {
    const h = await coupleHousehold(app);
    const add = (auth: Record<string, string>, data: Record<string, unknown>) =>
      http().post(`${h.base}/expenses`).set(auth).send(data).expect(201);
    await add(h.nicolas.auth, {
      paidById: h.nicolas.memberId,
      amountCents: 2000,
      date: '2026-09-20',
      title: 'Pharmacie',
      category: 'HEALTH',
    });
    await add(h.grace.auth, {
      paidById: h.grace.memberId,
      amountCents: 10000,
      date: '2026-09-05',
      title: 'Courses',
      category: 'GROCERIES',
    });
    // Personnelle : hors du bilan. Octobre : hors du bilan de septembre.
    await add(h.grace.auth, {
      paidById: h.grace.memberId,
      amountCents: 3000,
      date: '2026-09-06',
      title: 'Livre',
      split: 'PERSONAL',
    });
    await add(h.grace.auth, {
      paidById: h.grace.memberId,
      amountCents: 999,
      date: '2026-10-01',
      title: 'Pain',
    });
    await http()
      .put(`${h.base}/expenses/budget`)
      .set(h.grace.auth)
      .send({ budgetCents: 80000 })
      .expect(204);

    const bell = async (auth: Record<string, string>) =>
      (
        (await http().get(`${h.base}/notifications`).set(auth).expect(200)).body.items as Notif[]
      ).filter((n) => n.type === 'EXPENSE_MONTHLY');
    const summaries = app.get(ExpensesService);

    // 1er octobre, 7 h à Bruxelles : trop tôt.
    await summaries.sendMonthlySummaries(new Date('2026-10-01T05:00:00Z'));
    expect(await bell(h.grace.auth)).toHaveLength(0);

    await summaries.sendMonthlySummaries(new Date('2026-10-01T07:30:00Z'));
    const expected = {
      month: '2026-09',
      amountCents: 12000,
      count: 2,
      budgetCents: 80000,
      // Par prénom, pas par montant : aucun classement.
      paid: [
        { name: 'Grace', amountCents: 10000 },
        { name: 'Nicolas', amountCents: 2000 },
      ],
    };
    expect(await bell(h.grace.auth)).toEqual([expect.objectContaining(expected)]);
    expect(await bell(h.nicolas.auth)).toEqual([expect.objectContaining(expected)]);

    // Une seule fois par mois, même si la passe repasse.
    await summaries.sendMonthlySummaries(new Date('2026-10-02T09:00:00Z'));
    expect(await bell(h.grace.auth)).toHaveLength(1);
  });

  it('rien sans dépense commune, ni après le 3 ; préférence respectée ; autre foyer à part', async () => {
    const summaries = app.get(ExpensesService);
    const empty = await coupleHousehold(app);
    const late = await coupleHousehold(app);
    await http()
      .post(`${late.base}/expenses`)
      .set(late.grace.auth)
      .send({
        paidById: late.grace.memberId,
        amountCents: 4200,
        date: '2026-10-12',
        title: 'Cinéma',
        category: 'LEISURE',
      })
      .expect(201);
    await http()
      .put(`${late.base}/notification-preferences`)
      .set(late.nicolas.auth)
      .send({ preferences: [{ type: 'EXPENSE_MONTHLY', inApp: false, push: false }] })
      .expect(200);
    const bell = async (base: string, auth: Record<string, string>) =>
      (
        (await http().get(`${base}/notifications`).set(auth).expect(200)).body.items as Notif[]
      ).filter((n) => n.type === 'EXPENSE_MONTHLY');

    // 4 novembre : trop tard pour le bilan d'octobre (pas de bilan rattrapé des semaines après).
    await summaries.sendMonthlySummaries(new Date('2026-11-04T09:00:00Z'));
    expect(await bell(late.base, late.grace.auth)).toHaveLength(0);

    await summaries.sendMonthlySummaries(new Date('2026-11-01T09:00:00Z'));
    expect(await bell(late.base, late.grace.auth)).toEqual([
      expect.objectContaining({ month: '2026-10', amountCents: 4200, budgetCents: null }),
    ]);
    expect(await bell(late.base, late.nicolas.auth)).toHaveLength(0);
    expect(await bell(empty.base, empty.grace.auth)).toHaveLength(0);
  });

  it('texte de la notification, dans les trois langues', () => {
    const p = {
      month: '2026-10',
      amountCents: 31240,
      count: 3,
      budgetCents: 80000,
      paid: [],
    };
    const paid = [
      { name: 'Emma', amountCents: 20000 },
      { name: 'Tom', amountCents: 11240 },
    ];
    expect(monthlyPushText('fr', p, paid).body).toBe(
      'Bilan du mois · octobre : 312,40 € de dépenses communes (budget 800,00 €). Payé : Emma 200,00 €, Tom 112,40 €.',
    );
    expect(monthlyPushText('en', { ...p, budgetCents: null }, paid).body).toBe(
      'Monthly summary · October: €312.40 of shared expenses. Paid: Emma €200.00, Tom €112.40.',
    );
    expect(monthlyPushText('nl', { ...p, month: '2026-09' }, paid).body).toMatch(
      /^Maandoverzicht · september: €\s312,40 aan gedeelde uitgaven \(budget €\s800,00\)\. Betaald: Emma €\s200,00, Tom €\s112,40\.$/,
    );
    expect(monthlyPushText('fr', p, paid).url).toBe('/expenses?month=2026-10');
  });
});
