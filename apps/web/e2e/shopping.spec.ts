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

test('courses malignes : quantités, rayons, rayon retenu, souvent achetés', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  await page.getByRole('link', { name: 'Courses' }).first().click();
  await page
    .getByRole('textbox', { name: 'Ajouter à la liste' })
    .fill('2 kg de pommes, lait x6, Speculoos');
  await page.keyboard.press('Enter');

  const produce = page.getByRole('list', { name: '🥕 Fruits et légumes' });
  await expect(produce.getByRole('checkbox', { name: 'pommes' })).toBeVisible();
  await expect(produce.getByText('2 kg')).toBeVisible();
  await expect(
    page.getByRole('list', { name: '🧀 Crèmerie et œufs' }).getByText('x6'),
  ).toBeVisible();

  // Rayon inconnu → « Autres » ; corrigé une fois, il est retenu.
  await page.getByLabel('Rayon de Speculoos').selectOption('PANTRY');
  await expect(
    page.getByRole('list', { name: '🥫 Épicerie' }).getByRole('checkbox', { name: 'Speculoos' }),
  ).toBeVisible();

  // Acheté puis panier vidé → proposé dans « Souvent achetés », ajouté en un geste.
  await page.getByRole('checkbox', { name: 'lait' }).click();
  await page.getByRole('button', { name: 'Vider le panier' }).click();
  await page.getByRole('button', { name: 'Ajouter lait' }).click();
  await expect(
    page.getByRole('list', { name: '🧀 Crèmerie et œufs' }).getByRole('checkbox', { name: 'lait' }),
  ).toBeVisible();
});

test('courses : mode magasin plein écran, coche par rayon', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  await page.goto('/shopping');
  await page.getByRole('textbox', { name: 'Ajouter à la liste' }).fill('Tomates, Lait');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Lait' })).toBeVisible();

  await page.getByRole('button', { name: 'Mode magasin' }).click();
  const store = page.getByRole('dialog', { name: 'Au magasin' });
  await expect(store).toBeVisible();
  await expect(store.getByText('Encore 2 articles')).toBeVisible();
  await store.getByRole('checkbox', { name: /Tomates/ }).click();
  await expect(store.getByRole('checkbox', { name: /Tomates/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(store.getByText('Encore 1 article')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(store).toBeHidden();
  await expect(page.getByText('Dans le panier (1)')).toBeVisible();
});
