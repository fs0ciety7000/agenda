import { expect, test } from '@playwright/test';
import { addPartner, openSettings, signUpWithHousehold } from './helpers';

test('sauvegarde du foyer : téléchargée avec le mot de passe, restaurée par un autre compte', async ({
  page,
  browser,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Emma');
  await addPartner(page, baseURL!, 'Tom');
  await page.goto('/shopping');
  await page.getByRole('textbox', { name: 'Ajouter à la liste' }).fill('Café en grains');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Café en grains' })).toBeVisible();

  await openSettings(page);
  await page.getByRole('button', { name: 'Télécharger la sauvegarde' }).click();
  // Elle contient les notes sensibles : mot de passe demandé, comme pour les afficher.
  const dialog = page.getByRole('dialog', { name: 'Confirmer pour télécharger' });
  await dialog.getByLabel('Mot de passe').fill('correct horse battery');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Télécharger' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^tandem-foyer-\d{4}-\d{2}-\d{2}\.zip$/);
  const archive = await download.path();
  await expect(dialog).toBeHidden();

  // Une autre instance : un compte neuf, sans foyer, restaure l'archive dès l'arrivée.
  const other = await browser.newContext({ baseURL, locale: 'fr-BE' });
  const p2 = await other.newPage();
  await p2.goto('/register');
  await p2.getByLabel('Prénom').fill('Emma');
  await p2.getByLabel('Adresse email').fill(`emma.restore.${Date.now()}@example.test`);
  await p2.getByLabel('Mot de passe').fill('correct horse battery');
  await p2.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(p2).toHaveURL(/\/onboarding/);
  await expect(p2.getByRole('heading', { name: 'Vous avez une sauvegarde ?' })).toBeVisible();
  await p2.getByLabel('Choisir la sauvegarde').setInputFiles(archive);
  await expect(p2.getByRole('heading', { name: '✓ G & N est restauré' })).toBeFocused();
  // Tom n'a pas encore de compte ici : un lien pour lui.
  await expect(p2.getByRole('textbox', { name: 'Lien pour Tom' })).toHaveValue(/\/invite\//);
  await p2.getByRole('button', { name: 'Continuer' }).click();
  await p2.goto('/shopping');
  await expect(p2.getByRole('checkbox', { name: 'Café en grains' })).toBeVisible();
  await openSettings(p2);
  await expect(p2.getByRole('list', { name: 'Membres' }).getByText('en attente')).toBeVisible();
  await other.close();
});
