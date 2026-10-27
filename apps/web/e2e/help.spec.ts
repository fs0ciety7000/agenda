import { expect, test } from '@playwright/test';

test('questions fréquentes : page publique, liée depuis la connexion', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Aide' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Questions fréquentes' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: "Comment inviter l'autre personne ?" }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Signaler un problème/ })).toHaveAttribute(
    'href',
    /\/report\?from=/,
  );
});
