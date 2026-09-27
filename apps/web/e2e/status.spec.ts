import { expect, test } from '@playwright/test';

test('page publique /status : accessible sans connexion', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/status');
  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole('heading', { name: 'État du service', level: 1 })).toBeVisible();
  // Bandeau d'état global (inconnu tant que la première sonde n'a pas tourné).
  await expect(
    page.getByText(
      /Tous les services fonctionnent|Fonctionnement partiellement perturbé|Panne en cours|État inconnu/,
    ),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Incidents (90 jours)' })).toBeVisible();

  // Lien depuis la page d'accueil publique.
  await page.goto('/about');
  await page.getByRole('link', { name: 'État du service' }).click();
  await expect(page).toHaveURL(/\/status$/);
});
