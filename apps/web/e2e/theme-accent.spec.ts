import { expect, test } from '@playwright/test';
import { openSettings, signUpWithHousehold } from './helpers';

test('apparence : choisir la couleur du thème, gardée au rechargement', async ({ page }) => {
  await signUpWithHousehold(page, 'Emma');
  await openSettings(page);
  const colours = page.getByRole('radiogroup', { name: 'Couleur' });
  await expect(colours.getByRole('radio', { name: 'Encre' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await colours.getByRole('radio', { name: 'Océan' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'ocean');
  // La couleur d'action suit le thème (bouton principal, liens, focus).
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--gn-color-accent').trim(),
  );
  expect(accent.toUpperCase()).toBe('#1D5BD8');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'ocean');
  await page
    .getByRole('radiogroup', { name: 'Couleur' })
    .getByRole('radio', { name: 'Encre' })
    .click();
  await expect(page.locator('html')).not.toHaveAttribute('data-accent', /.+/);
});
