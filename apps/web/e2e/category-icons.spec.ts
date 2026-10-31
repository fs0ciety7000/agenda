import { expect, test } from '@playwright/test';
import { openSettings, signUpWithHousehold } from './helpers';

test('catégories : icônes maison à la place des émojis, choisies dans une grille', async ({
  page,
}) => {
  await signUpWithHousehold(page, 'Emma');
  await openSettings(page, 'Foyer');
  // Les catégories par défaut (émoji en base) s'affichent avec leur icône dessinée.
  const list = page.getByRole('button', { name: 'Modifier Maison' }).locator('xpath=ancestor::ul');
  await expect(list.locator('svg').first()).toBeVisible();
  await expect(list).not.toContainText('🏠');

  // Ajout : l'icône se choisit dans une grille, puis s'enregistre avec la catégorie.
  await page.getByRole('textbox', { name: 'Nom' }).last().fill('Vélo');
  const picker = page.getByRole('button', { name: /^Icône, / }).last();
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await picker.click();
  const grid = page.getByRole('group', { name: 'Icône' });
  await grid.getByRole('button', { name: 'Sport' }).click();
  await expect(grid).toBeHidden();
  await expect(picker).toHaveAccessibleName('Icône, Sport');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Modifier Vélo' })).toBeVisible();
  const households = await (await page.request.get('/v1/households')).json();
  const categories = await (
    await page.request.get(`/v1/households/${households[0].id}/categories`)
  ).json();
  expect(categories.find((c: { name: string }) => c.name === 'Vélo')?.emoji).toBe('🏃');
});
