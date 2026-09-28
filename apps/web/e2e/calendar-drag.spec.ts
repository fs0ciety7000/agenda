import { expect, test, type Page } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

const HEADERS = { 'x-requested-with': 'tandem' };

async function createTask(page: Page, body: Record<string, unknown>) {
  const households = await (await page.request.get('/v1/households')).json();
  const hid = households[0].id as string;
  const res = await page.request.post(`/v1/households/${hid}/tasks`, {
    headers: HEADERS,
    data: body,
  });
  expect(res.status()).toBe(201);
  const o = await res.json();
  return {
    get: async () => (await page.request.get(`/v1/households/${hid}/occurrences/${o.id}`)).json(),
  };
}

test('calendrier : glisser, redimensionner, déplacer au clavier et annuler', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  const today = todayBrussels();
  const task = await createTask(page, {
    title: 'Arroser les plantes',
    date: today,
    startMinute: 10 * 60,
    durationMinutes: 60,
  });
  await page.goto(`/calendar?view=day&date=${today}`);
  const block = page.getByRole('button', { name: /Arroser les plantes/ });
  await expect(block).toContainText('10:00');

  // Glisser d'une heure vers le bas (48 px par heure).
  const box = (await block.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 30, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, box.y + 12 + 48, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('« Arroser les plantes » déplacée', { exact: false })).toBeVisible();
  await expect(block).toContainText('11:00');
  await expect(page.getByRole('dialog')).toHaveCount(0); // le glisser n'ouvre pas la tâche
  await expect.poll(async () => (await task.get()).startMinute).toBe(11 * 60);

  // Tirer le bord inférieur : +30 minutes.
  const box2 = (await block.boundingBox())!;
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height - 3);
  await page.mouse.down();
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height - 3 + 24, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByText('Durée de « Arroser les plantes » modifiée')).toBeVisible();
  await expect.poll(async () => (await task.get()).durationMinutes).toBe(90);

  // Clavier : Alt + ↓ décale de 15 minutes, puis « Annuler » dans le toast.
  await block.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(block).toContainText('11:15');
  await expect.poll(async () => (await task.get()).startMinute).toBe(11 * 60 + 15);
  await page
    .getByRole('status')
    .locator('div')
    .filter({ hasText: /déplacée : .* · 11:15/ })
    .getByRole('button', { name: 'Annuler' })
    .click();
  await expect(block).toContainText('11:00');
  await expect.poll(async () => (await task.get()).startMinute).toBe(11 * 60);

  // Un simple clic ouvre toujours la tâche.
  await block.click();
  await expect(page.getByRole('dialog', { name: 'Modifier la tâche' })).toBeVisible();
});

test('calendrier mois : glisser une tâche vers un autre jour', async ({ page }) => {
  await signUpWithHousehold(page, 'Nicolas');
  const today = todayBrussels();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (d.getUTCDate() > 1 ? -1 : 1)); // même mois
  const target = d.toISOString().slice(0, 10);
  const task = await createTask(page, { title: 'Payer le loyer', date: today });
  await page.goto(`/calendar?view=month&date=${today}`);

  const block = page.getByRole('button', { name: /Payer le loyer/ });
  const from = (await block.boundingBox())!;
  const to = (await page.locator(`[data-date="${target}"]`).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('« Payer le loyer » déplacée', { exact: false })).toBeVisible();
  await expect(page.locator(`[data-date="${target}"]`)).toContainText('Payer le loyer');
  await expect.poll(async () => (await task.get()).date).toBe(target);
});

test('calendrier au doigt : appui long, puis glisser malgré le menu contextuel du navigateur', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Gestes tactiles');
  await signUpWithHousehold(page, 'Grace');
  const today = todayBrussels();
  const task = await createTask(page, {
    title: 'Étendre le linge',
    date: today,
    startMinute: 10 * 60,
    durationMinutes: 60,
  });
  await page.goto(`/calendar?view=day&date=${today}`);
  const block = page.getByRole('button', { name: /Étendre le linge/ });
  const box = (await block.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 12;
  await page.evaluate(() => {
    window.addEventListener('pointerdown', (e) => {
      (window as unknown as { lastPointer: number }).lastPointer = e.pointerId;
    });
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(600); // appui long
  // Ce que fait Chrome Android sur un appui long : menu contextuel puis annulation du pointeur.
  const menuBlocked = await page.evaluate(() => {
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(menu);
    const pointerId = (window as unknown as { lastPointer: number }).lastPointer;
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType: 'touch' }));
    return menu.defaultPrevented;
  });
  expect(menuBlocked).toBe(true);
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + i * 4.8 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByText('« Étendre le linge » déplacée', { exact: false })).toBeVisible();
  await expect.poll(async () => (await task.get()).startMinute).toBe(11 * 60);
});
