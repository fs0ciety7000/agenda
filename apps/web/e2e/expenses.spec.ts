import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold } from './helpers';

test('dépenses : une dépense commune, le solde, le remboursement', async ({
  page,
  baseURL,
}, info) => {
  await signUpWithHousehold(page, 'Grace');
  await addPartner(page, baseURL!, 'Nicolas');
  await page.goto('/');
  // Mobile : « Plus » → Dépenses ; desktop : menu latéral.
  if (info.project.name === 'mobile') {
    await page.getByRole('link', { name: 'Plus', exact: true }).click();
    await page.getByRole('link', { name: /^Dépenses/ }).click();
  } else {
    await page.getByRole('link', { name: 'Dépenses', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Dépenses', level: 1 })).toBeVisible();
  await expect(page.getByText('Aucune dépense ce mois-ci')).toBeVisible();
  await expect(page.getByText('Vous êtes à l’équilibre.')).toBeVisible();

  await page.getByRole('button', { name: 'Dépense', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Montant (€)').fill('80,50');
  await dialog.getByLabel('Quoi ?').fill('Courses de la semaine');
  await dialog.getByLabel('Catégorie').selectOption('GROCERIES');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText('Courses de la semaine')).toBeVisible();
  await expect(page.getByText('Payé par Grace · commune')).toBeVisible();
  await expect(page.getByText(/Nicolas doit 40,25\s€ à Grace/)).toBeVisible();

  await page.getByRole('button', { name: 'Enregistrer le remboursement' }).click();
  await expect(page.getByText('Vous êtes à l’équilibre.')).toBeVisible();
  await expect(page.getByText('Remboursement', { exact: true })).toBeVisible();
});
