import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

/** Code fictif (apps/api/test/fixtures/make-barcodes.py), inconnu d'Open Food Facts. */
const PHOTO = join(__dirname, '../../api/test/fixtures/barcode-photo.jpg');

test('courses : code-barres pris en photo, nommé, puis retrouvé par ses chiffres', async ({
  page,
}) => {
  await signUpWithHousehold(page, 'Emma');
  await page.goto('/shopping');

  await page.getByRole('button', { name: 'Scanner un code-barres' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter par code-barres' });
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await dialog.locator('input[type="file"]').setInputFiles(PHOTO);
  // Lu sur le serveur ; produit inconnu : on le nomme, le foyer s'en souviendra.
  await expect(dialog.getByText('Code 2001234567893')).toBeVisible();
  await expect(dialog.getByText(/Produit inconnu/)).toBeVisible();
  await dialog.getByLabel("Nom de l'article").fill('Lait de la ferme');
  await dialog.getByRole('button', { name: 'Ajouter à la liste' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('checkbox', { name: 'Lait de la ferme' })).toBeVisible();

  // Chiffres tapés : une erreur de saisie est signalée, le bon code retrouve le nom retenu.
  await page.getByRole('button', { name: 'Scanner un code-barres' }).click();
  await dialog.getByLabel('Ou tapez les chiffres du code').fill('2001234567890');
  await dialog.getByRole('button', { name: 'Chercher' }).click();
  await expect(dialog.getByText("Ce code n'est pas valide : vérifiez les chiffres.")).toBeVisible();
  await dialog.getByLabel('Ou tapez les chiffres du code').fill('2 001234 567893');
  await dialog.getByRole('button', { name: 'Chercher' }).click();
  await expect(dialog.getByLabel("Nom de l'article")).toHaveValue('Lait de la ferme');
  await expect(dialog.getByText('Déjà connu du foyer.')).toBeVisible();
});
