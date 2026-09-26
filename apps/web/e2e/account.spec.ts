import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('changer son mot de passe depuis les Réglages, puis se reconnecter avec', async ({ page }) => {
  const { email } = await signUpWithHousehold(page, 'Grace');
  await page.getByRole('link', { name: 'Réglages' }).first().click();

  await page.getByLabel('Mot de passe actuel').fill('pas le bon mot de passe');
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('une phrase toute neuve');
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('une phrase toute neuve');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByText('Mot de passe actuel incorrect.')).toBeVisible();

  await page.getByLabel('Mot de passe actuel').fill('correct horse battery');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByText('Mot de passe changé.', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill('une phrase toute neuve');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Grace 👋' })).toBeVisible();
});
