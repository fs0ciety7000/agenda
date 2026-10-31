import { expect, test, type Page } from '@playwright/test';
import { openSettings, signUpWithHousehold } from './helpers';

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test('identité « Deux fils » : papier et cobalt, plus de réglage de couleur', async ({ page }) => {
  // Un ancien choix de couleur (refonte Duo) est oublié au chargement.
  await page.addInitScript(() => localStorage.setItem('gn-accent', 'ocean'));
  await signUpWithHousehold(page, 'Emma');
  await openSettings(page);
  await expect(page.getByRole('radiogroup', { name: 'Couleur' })).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-accent', /.+/);
  await page.emulateMedia({ colorScheme: 'light' });
  expect((await cssVar(page, '--gn-color-accent')).toUpperCase()).toBe('#2D4BFF');
  expect((await cssVar(page, '--gn-color-bg')).toUpperCase()).toBe('#F3EEE4');
  // Les grands titres sont en Instrument Serif (police de secours : Georgia).
  const family = await page
    .getByRole('heading', { level: 1 })
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toMatch(/Georgia/);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect((await cssVar(page, '--gn-color-bg')).toUpperCase()).toBe('#0E1030');
});
