import { expect, test } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

const HEADERS = { 'x-requested-with': 'tandem' };

test('échéance « cette semaine » et reporter en un geste', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  const quickAdd = page.getByLabel('Ajouter une tâche rapidement');

  // Sans date, à faire d'ici dimanche : section dédiée sur Aujourd'hui.
  await quickAdd.fill('Rappeler le garage cette semaine');
  await expect(page.locator('#quick-add-preview')).toContainText('Cette semaine');
  await quickAdd.press('Enter');
  const due = page.getByRole('list', { name: 'À faire cette semaine' });
  await expect(due.getByText('Rappeler le garage')).toBeVisible();
  await expect(due.getByText('Cette semaine')).toBeVisible();

  // Reporter une tâche du jour à demain depuis sa fiche (heure conservée).
  const households = await (await page.request.get('/v1/households')).json();
  const hid = households[0].id as string;
  const created = await (
    await page.request.post(`/v1/households/${hid}/tasks`, {
      headers: HEADERS,
      data: { title: 'Arroser les plantes', date: todayBrussels(), startMinute: 18 * 60 },
    })
  ).json();
  await page.reload();
  await page
    .getByRole('list', { name: "Aujourd'hui" })
    .getByRole('button', { name: /Arroser les plantes/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Modifier la tâche' });
  await dialog.getByRole('button', { name: 'Demain' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/« Arroser les plantes » reportée à/)).toBeVisible();
  const tomorrow = new Date(`${todayBrussels()}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await expect
    .poll(async () => {
      const o = await (
        await page.request.get(`/v1/households/${hid}/occurrences/${created.id}`)
      ).json();
      return [o.date, o.startMinute];
    })
    .toEqual([tomorrow.toISOString().slice(0, 10), 18 * 60]);

  // Échéance choisie dans le formulaire.
  await page.getByRole('button', { name: "Plus d'options" }).click();
  const form = page.getByRole('dialog', { name: 'Nouvelle tâche' });
  await form.getByLabel('Titre').fill('Trier les papiers');
  await form.getByLabel('Échéance').selectOption('month');
  await form.getByRole('button', { name: 'Ajouter' }).click();
  await expect(form).toBeHidden();
  await expect
    .poll(async () => {
      const list = await (
        await page.request.get(`/v1/households/${hid}/occurrences?view=unscheduled`)
      ).json();
      return list.find((o: { title: string }) => o.title === 'Trier les papiers')?.dueDate;
    })
    .toMatch(/^\d{4}-\d{2}-(28|29|30|31)$/);
});
