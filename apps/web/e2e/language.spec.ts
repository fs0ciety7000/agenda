import { expect, test } from '@playwright/test';

test.describe('langue du navigateur : néerlandais', () => {
  test.use({ locale: 'nl-BE' });

  test('page de connexion en néerlandais, puis retour au français avec le sélecteur', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welkom terug' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aanmelden', exact: true })).toBeVisible();

    await page.getByRole('radio', { name: 'Français' }).click();
    await expect(page.getByRole('heading', { name: 'Bon retour' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bon retour' })).toBeVisible();
  });
});
