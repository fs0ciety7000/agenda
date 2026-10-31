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
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
  await page.getByLabel('Nom du foyer').fill('G & N');
  await page.getByRole('button', { name: 'Créer le foyer' }).click();

  await page.getByRole('button', { name: "Générer un lien d'invitation" }).click();
  await expect(page.getByRole('textbox', { name: 'Inviter votre partenaire' })).toHaveValue(
    /\/invite\/[\w-]{20,}/,
  );
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Bonjour Grace' })).toBeVisible();
  await expect(page.getByText("Rien pour aujourd'hui.")).toBeVisible();
});

test('accueil : une première tâche répétée en un toucher', async ({ page }) => {
  const email = `emma.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Prénom').fill('Emma');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill('correct horse battery');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Nom du foyer').fill('E & T');
  await page.getByRole('button', { name: 'Créer le foyer' }).click();

  await expect(page.getByRole('heading', { name: /Votre première tâche/ })).toBeVisible();
  await page
    .getByRole('button', { name: 'Ajouter « Sortir les poubelles », chaque semaine' })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: '« Sortir les poubelles » ajoutée.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Ajouter « Sortir les poubelles », chaque semaine' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Bonjour Emma' })).toBeVisible();
  await expect(page.getByText('Sortir les poubelles').first()).toBeVisible();
});

test('mauvais identifiants : message compréhensible', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill('personne@example.test');
  await page.getByLabel('Mot de passe').fill('mauvais mot de passe');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByText('Email ou mot de passe incorrect.')).toBeVisible();
});
