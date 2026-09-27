import { test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

// Captures de tous les écrans pour une revue visuelle (à la demande, pas en CI) :
// VISUAL=1 VISUAL_OUT=/tmp/shots pnpm --filter @agenda/web exec playwright test visual-review
const OUT = process.env.VISUAL_OUT!;
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
    const today = todayBrussels();
    const d = (n: number) => {
      const x = new Date(`${today}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + n);
      return x.toISOString().slice(0, 10);
    };
    const grace = partner.members.find((m: { displayName: string }) => m.displayName === 'Grace')!;
    const nico = partner.members.find((m: { displayName: string }) => m.displayName === 'Nicolas')!;
    const H = { 'x-requested-with': 'agenda-gn' };
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
    // Écran vide : nouveau foyer.
    await page.context().clearCookies();
    await signUpWithHousehold(page, 'Nicolas');
    await shot('today-empty');
    await page.goto('/shopping');
    await shot('shopping-empty');
  });
}
