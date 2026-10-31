import { test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

// Captures de tous les écrans pour une revue visuelle (à la demande, pas en CI) :
// VISUAL=1 VISUAL_OUT=/tmp/shots pnpm --filter @agenda/web exec playwright test visual-review
// VISUAL_LOCALE=en (ou nl) : comptes créés en français, puis écrans affichés dans cette langue.
// VISUAL_PUBLIC=1 : captures du site vitrine (apps/site/scripts/shots.mjs) : écran visible
// seulement, Emma et Tom, données dans la langue affichée.
const OUT = process.env.VISUAL_OUT!;
const PUBLIC = !!process.env.VISUAL_PUBLIC;
const [A, B] = PUBLIC ? ['Emma', 'Tom'] : ['Grace', 'Nicolas'];
/** Données de démonstration traduites (captures publiques en anglais et en néerlandais). */
const DATA: Record<string, Record<string, string>> = {
  en: {
    'Sortir les poubelles': 'Take out the trash',
    'Arroser les plantes': 'Water the plants',
    'Payer la facture d’électricité': 'Pay the electricity bill',
    'Rendez-vous garage': 'Car service appointment',
    'Courses pour le week-end': 'Weekend groceries',
    'Appeler le plombier': 'Call the plumber',
    'Ménage salle de bain': 'Clean the bathroom',
    Lait: 'Milk',
    Pain: 'Bread',
    Œufs: 'Eggs',
    Pâtes: 'Pasta',
    Tomates: 'Tomatoes',
    'Liquide vaisselle': 'Dish soap',
  },
  nl: {
    'Sortir les poubelles': 'Vuilnis buitenzetten',
    'Arroser les plantes': 'Planten water geven',
    'Payer la facture d’électricité': 'Elektriciteitsrekening betalen',
    'Rendez-vous garage': 'Afspraak garage',
    'Courses pour le week-end': 'Boodschappen voor het weekend',
    'Appeler le plombier': 'Loodgieter bellen',
    'Ménage salle de bain': 'Badkamer poetsen',
    Lait: 'Melk',
    Pain: 'Brood',
    Œufs: 'Eieren',
    Pâtes: 'Pasta',
    Tomates: 'Tomaten',
    'Liquide vaisselle': 'Afwasmiddel',
  },
};
const tr = (text: string) => (PUBLIC && LOCALE ? (DATA[LOCALE]?.[text] ?? text) : text);
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
      await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: !PUBLIC });
    };
    // Connexion dans la langue voulue, puis comptes créés en français (libellés des helpers).
    if (LOCALE)
      await page.context().addCookies([{ name: 'NEXT_LOCALE', value: LOCALE, url: baseURL! }]);
    await page.goto('/login');
    await shot('login');
    await page.context().clearCookies();
    await signUpWithHousehold(page, A);
    const partner = await addPartner(page, baseURL!, B);
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
    const grace = partner.members.find((m: { displayName: string }) => m.displayName === A)!;
    const nico = partner.members.find((m: { displayName: string }) => m.displayName === B)!;
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
        checklist: ['Lait', 'Pain', 'Œufs'].map(tr),
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
      await page.request.post(`/v1/households/${hid}/tasks`, {
        headers: H,
        data: { ...data, title: tr(data.title) },
      });
    for (const text of ['Lait', 'Pâtes', 'Tomates', 'Liquide vaisselle'])
      await page.request.post(`/v1/households/${hid}/shopping`, {
        headers: H,
        data: { id: crypto.randomUUID(), text: tr(text) },
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
    await page.request.post(`/v1/households/${hid}/meals`, {
      headers: H,
      data: { date: today, slot: 'DINNER', title: 'Lasagnes', ingredients: ['Pâtes', 'Tomates'] },
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
      ['settings-household', '/settings/household'],
      ['settings-account', '/settings/account'],
      ['settings-preferences', '/settings/preferences'],
      ['settings-data', '/settings/data'],
      ['about', '/about'],
      ['help', '/help'],
    ] as const) {
      await page.goto(path);
      await shot(name);
    }
    await page.goto('/');
    await page
      .getByRole('button', { name: new RegExp(`^${tr('Courses pour le week-end')}`) })
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
    await page.reload();
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
