import { INestApplication } from '@nestjs/common';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { csvCell } from '../src/expenses/expenses-csv';
import { budgetPushText } from '../src/notifications/notifications.service';
import { coupleHousehold, createTestApp, registerUser } from './app';

/** « 2026-10 » + n mois. */
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

type Notif = { type: string; level: number | null; amountCents: number | null; month: string };

describe('Dépenses : évolution, budget et alerte, export CSV', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');
  const month = today.slice(0, 7);
  const lastMonth = addMonths(month, -1);

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('évolution sur plusieurs mois : communes, les miennes, dépenses perso des autres exclues', async () => {
    const h = await coupleHousehold(app);
    const g = h.grace.memberId;
    const add = (body: object, auth = h.grace.auth) =>
      http().post(`${h.base}/expenses`).set(auth).send(body).expect(201);
    await add({ paidById: g, amountCents: 4000, date: `${lastMonth}-10`, title: 'Courses' });
    await add({ paidById: g, amountCents: 6000, date: today, title: 'Resto', category: 'LEISURE' });
    await add({ paidById: g, amountCents: 1500, date: today, title: 'Livre', split: 'PERSONAL' });

    const mine = await http()
      .get(`${h.base}/expenses/stats?month=${month}&months=3`)
      .set(h.grace.auth)
      .expect(200);
    expect(mine.body.months.map((m: { month: string }) => m.month)).toEqual([
      addMonths(month, -2),
      lastMonth,
      month,
    ]);
    expect(mine.body.months.map((m: { commonCents: number }) => m.commonCents)).toEqual([
      0, 4000, 6000,
    ]);
    expect(mine.body.months[2].mineCents).toBe(1500);

    const other = await http()
      .get(`${h.base}/expenses/stats?month=${month}&months=3`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(other.body.months[2].mineCents).toBe(0);
    expect(other.body.months[2].byCategory).toEqual([{ category: 'LEISURE', amountCents: 6000 }]);

    await http()
      .get(`${h.base}/expenses/stats?month=${month}&months=40`)
      .set(h.grace.auth)
      .expect(400);
  });

  it('budget : alerte à 80 % puis à 100 %, une seule fois, jamais pour soi', async () => {
    const h = await coupleHousehold(app);
    const g = h.grace.memberId;
    await http()
      .put(`${h.base}/expenses/budget`)
      .set(h.grace.auth)
      .send({ budgetCents: 0 })
      .expect(400);
    await http()
      .put(`${h.base}/expenses/budget`)
      .set(h.grace.auth)
      .send({ budgetCents: 10000 })
      .expect(204);
    const add = (amountCents: number, extra: object = {}) =>
      http()
        .post(`${h.base}/expenses`)
        .set(h.grace.auth)
        .send({ paidById: g, amountCents, date: today, title: 'Courses', ...extra })
        .expect(201);
    const budgetNotifs = async (auth: Record<string, string>) => {
      const res = await http().get(`${h.base}/notifications`).set(auth).expect(200);
      return (res.body.items as Notif[]).filter((n) => n.type === 'EXPENSE_BUDGET');
    };

    await add(7000);
    // Une dépense perso ne compte pas dans le budget commun.
    await add(5000, { split: 'PERSONAL' });
    expect(await budgetNotifs(h.nicolas.auth)).toHaveLength(0);

    await add(1000); // 80 €
    await add(500); // 85 € : toujours 80 %, pas de deuxième alerte
    let notifs = await budgetNotifs(h.nicolas.auth);
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ level: 80, amountCents: 8000, month });
    // Celle qui a saisi la dépense n'est pas prévenue de sa propre action.
    expect(await budgetNotifs(h.grace.auth)).toHaveLength(0);

    await add(2000); // 105 €
    notifs = await budgetNotifs(h.nicolas.auth);
    expect(notifs.map((n) => n.level)).toEqual([100, 80]);

    const summary = await http()
      .get(`${h.base}/expenses/summary?month=${month}`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(summary.body.budgetCents).toBe(10000);

    // Budget relevé par Nicolas : Grace est prévenue du nouveau seuil atteint.
    await http()
      .put(`${h.base}/expenses/budget`)
      .set(h.nicolas.auth)
      .send({ budgetCents: 12000 })
      .expect(204);
    expect((await budgetNotifs(h.grace.auth)).map((n) => n.level)).toEqual([80]);

    await http()
      .put(`${h.base}/expenses/budget`)
      .set(h.nicolas.auth)
      .send({ budgetCents: null })
      .expect(204);
    const after = await http()
      .get(`${h.base}/expenses/summary?month=${month}`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(after.body.budgetCents).toBeNull();
  });

  it('export CSV : langue du compte, parts, formules neutralisées, perso des autres exclues', async () => {
    const h = await coupleHousehold(app);
    const g = h.grace.memberId;
    const n = h.nicolas.memberId;
    const add = (body: object) =>
      http().post(`${h.base}/expenses`).set(h.grace.auth).send(body).expect(201);
    await add({
      paidById: g,
      amountCents: 4250,
      date: today,
      title: '=HYPERLINK("x")',
      note: 'a;b',
    });
    await add({ paidById: g, amountCents: 999, date: today, title: 'Secret', split: 'PERSONAL' });
    await http()
      .post(`${h.base}/expenses/settle`)
      .set(h.nicolas.auth)
      .send({ fromMemberId: n, toMemberId: g, amountCents: 2125 })
      .expect(201);

    const fr = await http()
      .get(`${h.base}/expenses/export?from=${lastMonth}&to=${month}`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(fr.headers['content-type']).toContain('text/csv');
    expect(fr.headers['content-disposition']).toContain(
      `tandem-depenses-${lastMonth}-${month}.csv`,
    );
    const lines = fr.text
      .replace(/^\ufeff/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe(
      'Date;Titre;Catégorie;Montant (EUR);Payé par;Partage;Pour;Part Nicolas;Part Grace;Note',
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      `${today};"'=HYPERLINK(""x"")";Autre;42,50;Grace;Commune;;21,25;21,25;"a;b"`,
    );
    expect(lines[2]).toBe(`${today};Remboursement;;21,25;Nicolas;Remboursement;Grace;;;`);
    expect(fr.text).not.toContain('Secret');

    // Grace voit sa dépense perso ; un compte en anglais reçoit un export en anglais.
    const mine = await http()
      .get(`${h.base}/expenses/export?from=${month}&to=${month}`)
      .set(h.grace.auth)
      .expect(200);
    expect(mine.text).toContain('Secret');
    await http().patch('/v1/me').set(h.grace.auth).send({ locale: 'en' }).expect(200);
    const en = await http()
      .get(`${h.base}/expenses/export?from=${month}&to=${month}`)
      .set(h.grace.auth)
      .expect(200);
    expect(en.headers['content-disposition']).toContain(`tandem-expenses-${month}.csv`);
    expect(en.text).toContain('Date,Title,Category,Amount (EUR),Paid by');
    expect(en.text).toContain(',42.50,');

    await http()
      .get(`${h.base}/expenses/export?from=${month}&to=${lastMonth}`)
      .set(h.grace.auth)
      .expect(400);
    const outsider = await registerUser(app, 'Intrus');
    await http()
      .get(`${h.base}/expenses/export?from=${month}&to=${month}`)
      .set(outsider.auth)
      .expect(404);
  });

  it('cellule CSV : guillemets, séparateur, formules', () => {
    expect(csvCell('simple', ';')).toBe('simple');
    expect(csvCell('a;b', ';')).toBe('"a;b"');
    expect(csvCell('a,b', ';')).toBe('a,b');
    expect(csvCell('dit "oui"', ',')).toBe('"dit ""oui"""');
    expect(csvCell('+33 6', ';')).toBe("'+33 6");
    expect(csvCell('@SUM(A1)', ';')).toBe("'@SUM(A1)");
  });

  it("texte de l'alerte dans les trois langues", () => {
    const b = { month: '2026-10', level: 80 as const, amountCents: 64000, budgetCents: 80000 };
    const clean = (t: string) => t.replace(/[\u00a0\u202f]/g, ' ');
    expect(clean(budgetPushText('fr', b).body)).toBe(
      'Budget commun · octobre : 80 % atteint (640,00 € sur 800,00 €)',
    );
    expect(clean(budgetPushText('fr', { ...b, level: 100 }).body)).toBe(
      'Budget commun · octobre : 100 % atteint (640,00 € sur 800,00 €)',
    );
    expect(budgetPushText('en', b).body).toBe(
      'Shared budget · October: 80% reached (€640.00 of €800.00)',
    );
    expect(clean(budgetPushText('nl', b).body)).toBe(
      'Gezamenlijk budget · oktober: 80% bereikt (€ 640,00 van € 800,00)',
    );
    expect(budgetPushText('fr', b).url).toBe('/expenses');
  });
});
