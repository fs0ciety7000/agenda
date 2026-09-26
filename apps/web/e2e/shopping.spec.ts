import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold } from './helpers';

test('courses : ajout de l’autre visible sans recharger, coche partagée, vider le panier', async ({
  page,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Grace');
  const partner = await addPartner(page, baseURL!, 'Nicolas');
  const base = `${baseURL}/v1/households/${partner.householdId}/shopping`;

  await page.goto('/shopping');
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
  await expect(page.getByText('En direct')).toBeVisible(); // flux temps réel ouvert (via le proxy Next)

  // Plusieurs articles d'un coup.
  await page.getByRole('textbox', { name: 'Ajouter à la liste' }).fill('Lait, pain');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Lait' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Pain' })).toBeVisible();

  // Nicolas ajoute depuis son téléphone : Grace le voit tout de suite (pas de rechargement).
  await fetch(base, {
    method: 'POST',
    headers: partner.headers,
    body: JSON.stringify({ text: 'Œufs' }),
  });
  await expect(page.getByRole('checkbox', { name: 'Œufs' })).toBeVisible({ timeout: 5_000 });

  // Grace coche au magasin ; Nicolas le voit coché.
  await page.getByRole('checkbox', { name: 'Lait' }).click();
  await expect(page.getByRole('heading', { name: 'Dans le panier (1)' })).toBeVisible();
  await expect
    .poll(async () => {
      const list = (await (await fetch(base, { headers: partner.headers })).json()) as {
        text: string;
        done: boolean;
      }[];
      return list.find((i) => i.text === 'Lait')?.done;
    })
    .toBe(true);

  // Nicolas décoche : l'article revient dans « À acheter » chez Grace.
  const list = (await (await fetch(base, { headers: partner.headers })).json()) as {
    id: string;
    text: string;
  }[];
  const milk = list.find((i) => i.text === 'Lait')!;
  await fetch(`${base}/${milk.id}`, {
    method: 'PATCH',
    headers: partner.headers,
    body: JSON.stringify({ done: false }),
  });
  await expect(page.getByRole('heading', { name: 'À acheter (3)' })).toBeVisible({
    timeout: 5_000,
  });

  await page.getByRole('checkbox', { name: 'Pain' }).click();
  await page.getByRole('button', { name: 'Vider le panier' }).click();
  await expect(page.getByRole('checkbox', { name: 'Pain' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'À acheter (2)' })).toBeVisible();
});
