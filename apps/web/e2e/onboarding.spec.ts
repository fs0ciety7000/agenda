import { expect, test } from '@playwright/test';

test('inscription → création du foyer → invitation → dashboard', async ({ page }) => {
  const email = `grace.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;

  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await page.getByLabel('Prénom').fill('Grace');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill('correct horse battery');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole('heading', { name: 'Bienvenue 👋' })).toBeVisible();
  await page.getByLabel('Nom du foyer').fill('G & N');
  await page.getByRole('button', { name: 'Créer le foyer' }).click();

  await page.getByRole('button', { name: "Générer un lien d'invitation" }).click();
  await expect(page.getByRole('textbox', { name: 'Inviter votre partenaire' })).toHaveValue(
    /\/invite\/[\w-]{20,}/,
  );
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Bonjour Grace 👋' })).toBeVisible();
  await expect(page.getByText("Rien pour aujourd'hui.")).toBeVisible();
});

test('mauvais identifiants : message compréhensible', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill('personne@example.test');
  await page.getByLabel('Mot de passe').fill('mauvais mot de passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Email ou mot de passe incorrect.')).toBeVisible();
});
