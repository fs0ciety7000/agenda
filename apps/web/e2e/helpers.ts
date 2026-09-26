import { expect, type Page } from '@playwright/test';

/** Inscription + création d'un foyer ; termine sur le dashboard. */
export async function signUpWithHousehold(page: Page, name = 'Grace') {
  const email = `${name.toLowerCase()}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Prénom').fill(name);
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill('correct horse battery');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Nom du foyer').fill('G & N');
  await page.getByRole('button', { name: 'Créer le foyer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: `Bonjour ${name} 👋` })).toBeVisible();
  return { email };
}
