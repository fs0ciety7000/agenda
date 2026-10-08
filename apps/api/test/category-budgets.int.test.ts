import { INestApplication } from '@nestjs/common';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { budgetPushText } from '../src/notifications/notifications.service';
import { coupleHousehold, createTestApp, registerUser } from './app';

type Notif = {
  type: string;
  level: number | null;
  category: string | null;
  amountCents: number | null;
};

describe('Dépenses : budgets par catégorie', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');
  const month = today.slice(0, 7);

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('régler, relire (ordre des catégories), remplacer ; validations et droits', async () => {
    const h = await coupleHousehold(app);
    const put = (budgets: object[], auth = h.grace.auth) =>
      http().put(`${h.base}/expenses/budget/categories`).set(auth).send({ budgets });
    await put([
      { category: 'LEISURE', budgetCents: 15000 },
      { category: 'GROCERIES', budgetCents: 40000 },
    ]).expect(204);
    const summary = await http()
      .get(`${h.base}/expenses/summary?month=${month}`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(summary.body.categoryBudgets).toEqual([
      { category: 'GROCERIES', budgetCents: 40000 },
      { category: 'LEISURE', budgetCents: 15000 },
    ]);
    await put([
      { category: 'GROCERIES', budgetCents: 1 },
      { category: 'GROCERIES', budgetCents: 2 },
    ]).expect(400);
    await put([{ category: 'GROCERIES', budgetCents: 0 }]).expect(400);
    await put([{ category: 'HOUSING', budgetCents: 90000 }], h.nicolas.auth).expect(204);
    const after = await http()
      .get(`${h.base}/expenses/summary?month=${month}`)
      .set(h.grace.auth)
      .expect(200);
    expect(after.body.categoryBudgets).toEqual([{ category: 'HOUSING', budgetCents: 90000 }]);
    await put([]).expect(204);

    const outsider = await registerUser(app, 'Intrus');
    await put([{ category: 'HOUSING', budgetCents: 1 }], outsider.auth).expect(404);
  });

  it('alerte par catégorie à 80 % puis 100 %, indépendante du budget global', async () => {
    const h = await coupleHousehold(app);
    const g = h.grace.memberId;
    await http()
      .put(`${h.base}/expenses/budget/categories`)
      .set(h.grace.auth)
      .send({ budgets: [{ category: 'GROCERIES', budgetCents: 10000 }] })
      .expect(204);
    await http()
      .put(`${h.base}/expenses/budget`)
      .set(h.grace.auth)
      .send({ budgetCents: 100000 })
      .expect(204);
    const add = (amountCents: number, category: string, extra: object = {}) =>
      http()
        .post(`${h.base}/expenses`)
        .set(h.grace.auth)
        .send({ paidById: g, amountCents, date: today, title: 'Achat', category, ...extra })
        .expect(201);
    const budgetNotifs = async () =>
      (
        (await http().get(`${h.base}/notifications`).set(h.nicolas.auth).expect(200)).body
          .items as Notif[]
      ).filter((n) => n.type === 'EXPENSE_BUDGET');

    await add(5000, 'LEISURE'); // autre catégorie : ne compte pas pour les courses
    await add(4000, 'GROCERIES', { split: 'PERSONAL' }); // perso : ne compte pas
    expect(await budgetNotifs()).toHaveLength(0);

    await add(8000, 'GROCERIES'); // 80 € de courses
    let notifs = await budgetNotifs();
    expect(notifs).toEqual([
      expect.objectContaining({ level: 80, category: 'GROCERIES', amountCents: 8000 }),
    ]);
    await add(1000, 'GROCERIES'); // 90 € : pas de deuxième alerte
    expect(await budgetNotifs()).toHaveLength(1);
    await add(2000, 'GROCERIES'); // 110 € de courses ; total commun 160 € sur 1 000 €
    notifs = await budgetNotifs();
    expect(notifs.map((n) => [n.level, n.category])).toEqual([
      [100, 'GROCERIES'],
      [80, 'GROCERIES'],
    ]);

    // Le budget global garde ses propres seuils.
    await add(70000, 'HOUSING');
    notifs = await budgetNotifs();
    expect(notifs[0]).toMatchObject({ level: 80, category: null });
  });

  it('texte de l’alerte avec la catégorie', () => {
    const b = { month: '2026-10', level: 80 as const, amountCents: 32000, budgetCents: 40000 };
    const clean = (t: string) => t.replace(/[\u00a0\u202f]/g, ' ');
    expect(clean(budgetPushText('fr', { ...b, category: 'GROCERIES' }).body)).toBe(
      'Courses · octobre : 80 % atteint (320,00 € sur 400,00 €)',
    );
    expect(budgetPushText('en', { ...b, category: 'LEISURE' }).body).toBe(
      'Leisure and outings · October: 80% reached (€320.00 of €400.00)',
    );
    expect(clean(budgetPushText('nl', b).body)).toBe(
      'Gezamenlijk budget · oktober: 80% bereikt (€ 320,00 van € 400,00)',
    );
  });
});
