import { expect, test } from '@playwright/test';
import { openSettings, signUpWithHousehold } from './helpers';

test('sauvegarde chiffrée : phrase de passe au téléchargement, demandée à la restauration', async ({
  page,
  browser,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Emma');
  await page.goto('/shopping');
  await page.getByRole('textbox', { name: 'Ajouter à la liste' }).fill('Thé vert');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Thé vert' })).toBeVisible();

  await openSettings(page, 'Données et aide');
  await page.getByLabel('Chiffrer avec une phrase de passe').check();
  const download = page.getByRole('button', { name: 'Télécharger la sauvegarde' });
  await page.getByLabel('Phrase de passe', { exact: true }).fill('quatre mots pour la sauvegarde');
  await page.getByLabel('Retapez la phrase de passe').fill('autre chose');
  await expect(page.getByText('Les deux phrases ne sont pas identiques.')).toBeVisible();
  await expect(download).toBeDisabled();
  await page.getByLabel('Retapez la phrase de passe').fill('quatre mots pour la sauvegarde');
  await download.click();
  const dialog = page.getByRole('dialog', { name: 'Confirmer pour télécharger' });
  await dialog.getByLabel('Mot de passe').fill('correct horse battery');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Télécharger' }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^tandem-foyer-\d{4}-\d{2}-\d{2}\.tandem$/);
  const archive = await file.path();

  const other = await browser.newContext({ baseURL, locale: 'fr-BE' });
  const p2 = await other.newPage();
  await p2.goto('/register');
  await p2.getByLabel('Prénom').fill('Emma');
  await p2.getByLabel('Adresse email').fill(`emma.enc.${Date.now()}@example.test`);
  await p2.getByLabel('Mot de passe').fill('correct horse battery');
  await p2.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(p2).toHaveURL(/\/onboarding/);
  await p2.getByLabel('Choisir la sauvegarde').setInputFiles(archive);
  const phrase = p2.getByLabel('Phrase de passe');
  await expect(phrase).toBeVisible();
  await phrase.fill('pas la bonne phrase');
  await p2.getByRole('button', { name: 'Déchiffrer et restaurer' }).click();
  await expect(p2.getByRole('alert').filter({ hasText: 'Phrase de passe incorrecte' })).toHaveText(
    'Phrase de passe incorrecte, ou fichier abîmé.',
  );
  await phrase.fill('quatre mots pour la sauvegarde');
  await p2.getByRole('button', { name: 'Déchiffrer et restaurer' }).click();
  await expect(p2.getByRole('heading', { name: '✓ G & N est restauré' })).toBeFocused();
  await p2.getByRole('button', { name: 'Continuer' }).click();
  await p2.goto('/shopping');
  await expect(p2.getByRole('checkbox', { name: 'Thé vert' })).toBeVisible();
  await other.close();
});
