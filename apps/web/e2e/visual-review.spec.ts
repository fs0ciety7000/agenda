import { test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

// Captures de tous les écrans pour une revue visuelle (à la demande, pas en CI) :
// VISUAL=1 VISUAL_OUT=/tmp/shots pnpm --filter @agenda/web exec playwright test visual-review
// VISUAL_LOCALE=en (ou nl) : comptes créés en français, puis écrans affichés dans cette langue.
const OUT = process.env.VISUAL_OUT!;
const LOCALE = process.env.VISUAL_LOCALE;
test.skip(!process.env.VISUAL, 'revue visuelle manuelle');

for (const scheme of ['light', 'dark'] as const) {
  test(`captures ${scheme}`, async ({ page, baseURL }, info) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme });
    const tag = `${info.project.name}-${scheme}`;
    const shot = async (name: string) => {
      await page.waitForLoadState('load');
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true });
    };
    await page.goto('/login');
    await shot('login');
    await signUpWithHousehold(page, 'Grace');
    const partner = await addPartner(page, baseURL!, 'Nicolas');
    const hid = partner.householdId as string;
    const switchLocale = () =>
      LOCALE
        ? page.context().addCookies([{ name: 'NEXT_LOCALE', value: LOCALE, url: baseURL! }])
        : Promise.resolve();
    await switchLocale();
    const today = todayBrussels();
    const d = (n: number) => {
      const x = new Date(`${today}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + n);
      return x.toISOString().slice(0, 10);
    };
    const grace = partner.members.find((m: { displayName: string }) => m.displayName === 'Grace')!;
    const nico = partner.members.find((m: { displayName: string }) => m.displayName === 'Nicolas')!;
    const H = { 'x-requested-with': 'tandem' };
    const tasks = [
      { title: 'Sortir les poubelles', date: today, startMinute: 19 * 60, assigneeIds: [nico.id] },
      { title: 'Arroser les plantes', date: today, durationMinutes: 15, assigneeIds: [grace.id] },
      {
        title: 'Payer la facture d’électricité',
        date: d(-2),
        priority: 'HIGH',
        assigneeIds: [grace.id],
      },
      {
        title: 'Rendez-vous garage',
        date: d(2),
        startMinute: 9 * 60,
        durationMinutes: 60,
        assigneeIds: [nico.id],
      },
      {
        title: 'Courses pour le week-end',
        date: d(3),
        assigneeIds: [grace.id, nico.id],
        checklist: ['Lait', 'Pain', 'Œufs'],
      },
      { title: 'Appeler le plombier', dueDate: d(4) },
      {
        title: 'Ménage salle de bain',
        date: today,
        recurrence: {
          rule: { freq: 'WEEKLY' },
          rotation: { mode: 'ALTERNATE', memberIds: [grace.id, nico.id] },
        },
      },
    ];
    for (const data of tasks)
      await page.request.post(`/v1/households/${hid}/tasks`, { headers: H, data });
    for (const text of ['Lait', 'Pâtes', 'Tomates', 'Liquide vaisselle'])
      await page.request.post(`/v1/households/${hid}/shopping`, {
        headers: H,
        data: { id: crypto.randomUUID(), text },
      });
    for (const data of [
      { title: 'Wi-Fi', body: 'Réseau : Maison\nCode : 4F7K-29QM', pinned: true },
      { title: 'Idées cadeaux', body: 'Grace : un livre de cuisine\nNicolas : des gants de vélo' },
      { title: 'Mesures', body: 'Fenêtre du salon : 120 × 140 cm' },
    ])
      await page.request.post(`/v1/households/${hid}/notes`, { headers: H, data });
    const md = (n: number) => {
      const x = new Date(`${d(n)}T12:00:00Z`);
      return { month: x.getUTCMonth() + 1, day: x.getUTCDate() };
    };
    for (const data of [
      { title: 'Anniversaire de mamie', kind: 'BIRTHDAY', ...md(5), year: 1950 },
      { title: 'Entretien chaudière', kind: 'MAINTENANCE', ...md(40), remindDaysBefore: 14 },
      { title: 'Anniversaire de mariage', kind: 'ANNIVERSARY', ...md(120), year: 2015 },
    ])
      await page.request.post(`/v1/households/${hid}/important-dates`, { headers: H, data });
    for (const data of [
      {
        paidById: grace.id,
        amountCents: 8640,
        date: today,
        title: 'Courses de la semaine',
        category: 'GROCERIES',
      },
      { paidById: nico.id, amountCents: 4200, date: today, title: 'Cinéma', category: 'LEISURE' },
    ])
      await page.request.post(`/v1/households/${hid}/expenses`, { headers: H, data });
    await page.request.put(`/v1/households/${hid}/expenses/budget`, {
      headers: H,
      data: { budgetCents: 80000 },
    });
    await page.request.put(`/v1/households/${hid}/expenses/budget/categories`, {
      headers: H,
      data: {
        budgets: [
          { category: 'GROCERIES', budgetCents: 40000 },
          { category: 'LEISURE', budgetCents: 4500 },
        ],
      },
    });
    await page.request.post(`/v1/households/${hid}/templates`, {
      headers: H,
      data: {
        name: 'Ménage du samedi',
        emoji: '🧹',
        items: [{ title: 'Aspirateur' }, { title: 'Draps' }],
      },
    });

    for (const [name, path] of [
      ['today', '/'],
      ['tasks', '/tasks'],
      ['shopping', '/shopping'],
      ['cal-month', `/calendar?view=month&date=${today}`],
      ['cal-week', `/calendar?view=week&date=${today}`],
      ['cal-day', `/calendar?view=day&date=${today}`],
      ['stats', '/stats'],
      ['expenses', '/expenses'],
      ['notes', '/notes'],
      ['dates', '/dates'],
      ['meals', '/meals'],
      ['more', '/more'],
      ['review', '/review'],
      ['history', '/history'],
      ['settings', '/settings'],
      ['about', '/about'],
    ] as const) {
      await page.goto(path);
      await shot(name);
    }
    await page.goto('/');
    await page
      .getByRole('button', { name: /^Courses pour le week-end/ })
      .first()
      .click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${tag}-form.png` });
    await page.keyboard.press('Escape');
    // Recherche globale et tiroir « Plus » (téléphone).
    await page.keyboard.press('/');
    await page.getByRole('searchbox').last().fill('cour');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${tag}-search.png` });
    await page.keyboard.press('Escape');
    if (info.project.name === 'mobile') {
      await page.locator('nav').last().locator('button').last().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${tag}-drawer.png` });
      await page.keyboard.press('Escape');
    }
    // Écran vide : nouveau foyer.
    await page.context().clearCookies();
    await signUpWithHousehold(page, 'Nicolas');
    await switchLocale();
    await shot('today-empty');
    for (const [name, path] of [
      ['shopping-empty', '/shopping'],
      ['meals-empty', '/meals'],
      ['expenses-empty', '/expenses'],
      ['notes-empty', '/notes'],
      ['dates-empty', '/dates'],
    ] as const) {
      await page.goto(path);
      await shot(name);
    }
  });
}
