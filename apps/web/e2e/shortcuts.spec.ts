import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('raccourcis clavier : N nouvelle tâche, / recherche, T aujourd’hui', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Raccourcis clavier : ordinateur');
  await signUpWithHousehold(page, 'Grace');

  // N : l'ajout rapide prend le focus.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('n');
  await expect(
    page.getByRole('textbox', { name: /Ajouter une tâche|Nouvelle tâche/ }),
  ).toBeFocused();

  // Pendant la saisie, « / » et « t » s'écrivent normalement.
  await page.keyboard.type('t/');
  await expect(page).toHaveURL(/\/$/);

  // / : recherche des tâches, depuis n'importe quelle page.
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  await expect(page).toHaveURL(/\/tasks/);
  await expect(page.getByRole('searchbox', { name: 'Rechercher' })).toBeFocused();

  // T : retour à Aujourd'hui (hors champ).
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('t');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /Bonjour Grace/ })).toBeVisible();
});
