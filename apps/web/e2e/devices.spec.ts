import { expect, test } from '@playwright/test';
import { openSettings, signUpWithHousehold } from './helpers';

test('appareils connectés : voir l’autre connexion et la déconnecter à distance', async ({
  page,
  browser,
}) => {
  const { email } = await signUpWithHousehold(page, 'Grace');

  // Deuxième appareil : un autre navigateur se connecte au même compte.
  const other = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  });
  const phone = await other.newPage();
  await phone.goto('/login');
  await phone.getByLabel('Adresse email').fill(email);
  await phone.getByLabel('Mot de passe').fill('correct horse battery');
  await phone.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(phone.getByRole('heading', { name: 'Bonjour Grace 👋' })).toBeVisible();

  await openSettings(page);
  const list = page.getByRole('list', { name: 'Appareils connectés' });
  await expect(list.getByText('Cet appareil')).toBeVisible();
  await expect(list.getByText('Firefox · Linux')).toBeVisible();
  await list.getByRole('button', { name: 'Déconnecter Firefox · Linux' }).click();
  await expect(page.getByText('Firefox · Linux est déconnecté.')).toBeVisible();
  await expect(list.getByText('Firefox · Linux')).toHaveCount(0);

  // L'autre navigateur est renvoyé vers la connexion.
  await phone.reload();
  await expect(phone).toHaveURL(/\/login/);
  await other.close();
});

test('appareils connectés : déconnecter tous les autres d’un coup', async ({ page, browser }) => {
  const { email } = await signUpWithHousehold(page, 'Grace');
  const others = [];
  for (const userAgent of [
    'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0',
  ]) {
    const context = await browser.newContext({ userAgent });
    const p = await context.newPage();
    await p.goto('/login');
    await p.getByLabel('Adresse email').fill(email);
    await p.getByLabel('Mot de passe').fill('correct horse battery');
    await p.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Bonjour Grace 👋' })).toBeVisible();
    others.push({ context, page: p });
  }

  await openSettings(page);
  const list = page.getByRole('list', { name: 'Appareils connectés' });
  await expect(list.getByText('Edge · Windows')).toBeVisible();
  await page.getByRole('button', { name: 'Déconnecter les autres appareils' }).click();
  const dialog = page.getByRole('dialog', { name: 'Déconnecter les 2 autres appareils ?' });
  await dialog.getByRole('button', { name: 'Déconnecter les autres appareils' }).click();
  await expect(page.getByText('2 appareils déconnectés.')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByText('Cet appareil')).toBeVisible();

  // Cet appareil reste connecté ; les autres reviennent à la connexion.
  await page.reload();
  await expect(page).toHaveURL(/\/settings/);
  for (const o of others) {
    await o.page.reload();
    await expect(o.page).toHaveURL(/\/login/);
    await o.context.close();
  }
});
