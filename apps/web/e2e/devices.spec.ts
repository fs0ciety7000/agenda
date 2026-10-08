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
