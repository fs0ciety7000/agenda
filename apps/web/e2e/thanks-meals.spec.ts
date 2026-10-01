import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

test('merci : cœur sur la tâche faite par l’autre, revue de la semaine', async ({
  page,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Grace');
  const partner = await addPartner(page, baseURL!, 'Nicolas');
  const base = `${baseURL}/v1/households/${partner.householdId}`;
  const task = await (
    await fetch(`${base}/tasks`, {
      method: 'POST',
      headers: partner.headers,
      body: JSON.stringify({ title: 'Sortir les poubelles', date: todayBrussels() }),
    })
  ).json();
  await fetch(`${base}/occurrences/${task.id}/complete`, {
    method: 'POST',
    headers: partner.headers,
  });

  await page.goto('/');
  const heart = page.getByRole('button', { name: 'Dire merci à Nicolas' });
  await heart.click();
  await expect(page.getByRole('button', { name: 'Merci envoyé à Nicolas' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(async () => {
      const bell = await (
        await fetch(`${base}/notifications`, { headers: partner.headers })
      ).json();
      return bell.items.some((n: { type: string }) => n.type === 'TASK_THANKS');
    })
    .toBe(true);

  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Revue de la semaine' })).toBeVisible();
  await expect(page.getByText('1 tâche faite')).toBeVisible();
});

test('menus : un repas, ses ingrédients envoyés aux courses', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  await page.goto('/meals');
  await expect(page.getByRole('heading', { name: 'Menus' })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter (Soir)' }).first().click();
  await page.getByRole('textbox', { name: 'Repas', exact: true }).fill('Lasagnes');
  await page.getByRole('textbox', { name: 'Ingrédients' }).fill('Tomates\nPâtes à lasagne');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Lasagnes')).toBeVisible();

  await page
    .getByRole('button', { name: /Ajouter les ingrédients de 1 repas aux courses/ })
    .click();
  await expect(page.getByText('2 articles ajoutés aux courses.')).toBeVisible();
  await page.goto('/shopping');
  await expect(page.getByRole('checkbox', { name: 'Tomates' })).toBeVisible();
});
